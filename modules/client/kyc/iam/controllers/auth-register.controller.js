const AuthRegisterService = require('../services/auth-register.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');
const { jwt: jwtConfig } = require('../../../../../shared/constants');

// ============================================================
// COOKIE CONFIG — mismos valores que auth-login.controller
// ============================================================

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/'
};

// El maxAge sigue la vida REAL de cada token (ver auth-login.controller): una cookie que vive más
// que su token deja al navegador mandando credenciales muertas.
const REFRESH_TOKEN_TTL_HOURS = 24;

const ACCESS_TOKEN_TTL = jwtConfig.accessTokenExpiry; // 15 min — exp del access token RS256
const REFRESH_TOKEN_TTL = REFRESH_TOKEN_TTL_HOURS * 3600; // 24h — exp del refresh y TTL del JTI en Redis

const _setAuthCookies = (res, tokens) => {
  res.cookie('access_token', tokens.accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: ACCESS_TOKEN_TTL * 1000
  });
  res.cookie('refresh_token', tokens.refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_TTL * 1000
  });
};

// ============================================================
// CONTROLLER
// ============================================================

class AuthRegisterController {
  /**
   * POST /auth/register
   *
   * El registro hace login automático al final.
   * Web:    setea cookies httpOnly + devuelve tokens en body (el front necesita expiresIn)
   * Mobile: devuelve tokens en body solamente
   */
  register = asyncHandler(async (req, res) => {
    const clientType = req.headers['x-client-type'];

    const result = await AuthRegisterService.register(req.body, {
      ip: res.locals.auditContext?.ip
    });

    if (clientType === 'web') {
      _setAuthCookies(res, result.tokens);
    }

    return ApiResponse.created(res, 'Usuario registrado exitosamente', result);
  });

  /**
   * POST /auth/reset-credentials/request
   * Sin cambios — no devuelve tokens
   */
  requestResetCredentials = asyncHandler(async (req, res) => {
    await AuthRegisterService.requestResetCredentials(req.body);
    return ApiResponse.success(res, 'Si el email existe en nuestro sistema, recibirás un correo con instrucciones');
  });

  /**
   * POST /auth/reset-credentials/confirm
   * Sin cambios — no devuelve tokens
   */
  confirmResetCredentials = asyncHandler(async (req, res) => {
    await AuthRegisterService.confirmResetCredentials(req.body);
    const message = req.body.type === 'password' ? 'Contraseña actualizada exitosamente' : 'MFA desactivado exitosamente';
    return ApiResponse.success(res, message);
  });
}

module.exports = new AuthRegisterController();
