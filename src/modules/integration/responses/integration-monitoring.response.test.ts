// La salida de cada constructor de integration cumple su esquema (y por lo tanto su documentación).
import dto, {
  FallbackEventSchema,
  IntegrationDashboardSchema,
  IntegrationLogDetailSchema,
  IntegrationLogItemSchema,
  ProvidersHealthSchema
} from './integration-monitoring.response';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const at = new Date('2026-01-01T00:00:00Z');
const stat = { product: 'ses', total: 10, success: 8, failed: 1, circuitOpen: 1, systemError: 0, successRate: 88.89, avgResponseMs: 120 };
const fallback = { fallbackEventId: ID, provider: 'aws_ses', circuitProduct: 'ses', startedAt: at, endedAt: null, affectedProcessesCount: 3 };
const log = {
  apiLogId: ID,
  product: 'ses',
  endpoint: 'SendEmail',
  result: 'success',
  responseTimeMs: 90,
  errorCode: null,
  errorMessage: null,
  requestPayload: { to: '***' },
  responsePayload: null,
  isSystemError: false,
  notificationId: null,
  createdAt: at,
  user: { userId: ID, username: 'ana' },
  session: { userSessionId: ID, ipAddress: '1.1.1.1', userAgent: 'jest', status: 'active', startedAt: at }
};

const ok = (schema: { safeParse(v: unknown): { error?: { issues: unknown[] } } }, value: unknown) =>
  expect(schema.safeParse(value).error?.issues ?? []).toEqual([]);

describe('esquemas de salida de integration', () => {
  it('tablero', () => {
    const product = dto.buildProductView(stat as never, { status: 'CLOSED', failures: 0 }, 95);
    ok(
      IntegrationDashboardSchema,
      dto.IntegrationDashboardDTO({
        summary: { totalCalls: 10, success: 8, failed: 1, circuitOpen: 1, successRate: 88.89 },
        products: [product],
        activeFallbacks: 1,
        recentFallbacks: [fallback as never],
        meta: { from: null, to: null, generatedAt: at.toISOString() },
        minSuccessRate: 95
      })
    );
  });

  it('salud de proveedores', () => {
    const p = dto.buildProductView(stat as never, null, 95);
    ok(ProvidersHealthSchema, {
      providers: [{ product: p.product, availabilityStatus: p.availabilityStatus, circuit: p.circuit, successRate: p.successRate, avgResponseMs: p.avgResponseMs }],
      activeFallbacks: 0,
      generatedAt: at.toISOString()
    });
  });

  it('bitácora de llamadas y su detalle', () => {
    ok(IntegrationLogItemSchema, dto.IntegrationLogListItemDTO(log as never));
    ok(IntegrationLogDetailSchema, dto.IntegrationLogDetailDTO(log as never));
  });

  it('fallback', () => {
    ok(FallbackEventSchema, dto.FallbackEventDTO(fallback as never));
  });
});
