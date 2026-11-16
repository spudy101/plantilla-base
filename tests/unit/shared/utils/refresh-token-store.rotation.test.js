// tests/unit/shared/utils/refresh-token-store.rotation.test.js
//
// Regresión: la ventana de gracia de rotación se guardaba con JSON.stringify y se leía con
// JSON.parse sobre lo que redisClient.get YA devuelve parseado → getRotation siempre era null.
// El Redis falso replica la serialización real de shared/utils/redis.util (set serializa objetos,
// get parsea JSON) para que el test detecte cualquier doble (de)serialización.

const mockStore = new Map();

jest.mock('shared/utils/redis.util', () => ({
  isAvailable: () => true,
  set: jest.fn(async (key, value) => {
    mockStore.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    return true;
  }),
  get: jest.fn(async key => {
    const raw = mockStore.get(key);
    if (raw === undefined) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  })
}));
jest.mock('shared/utils/logger.util', () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));

const RefreshTokenStore = require('shared/utils/refresh-token-store.util');
const redisClient = require('shared/utils/redis.util');

const TOKENS = { accessToken: 'a-1', refreshToken: 'r-1', expiresIn: 900 };

describe('RefreshTokenStore — ventana de gracia de rotación', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it('devuelve el mismo par de tokens que se guardó al rotar', async () => {
    await expect(RefreshTokenStore.saveRotation('jti-old', TOKENS)).resolves.toBe(true);

    await expect(RefreshTokenStore.getRotation('jti-old')).resolves.toEqual(TOKENS);
  });

  it('guarda el objeto y deja la serialización a redisClient (sin JSON.stringify doble)', async () => {
    await RefreshTokenStore.saveRotation('jti-old', TOKENS);

    const [, storedValue] = redisClient.set.mock.calls[0];
    expect(storedValue).toEqual(TOKENS);
  });

  it('sigue leyendo valores guardados con la versión anterior (string JSON doblemente serializado)', async () => {
    const legacyKey = RefreshTokenStore._buildRotatedKey('jti-legacy');
    mockStore.set(legacyKey, JSON.stringify(JSON.stringify(TOKENS)));

    await expect(RefreshTokenStore.getRotation('jti-legacy')).resolves.toEqual(TOKENS);
  });

  it('sin rotación previa devuelve null', async () => {
    await expect(RefreshTokenStore.getRotation('jti-inexistente')).resolves.toBeNull();
  });
});
