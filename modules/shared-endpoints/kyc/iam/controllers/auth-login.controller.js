const AuthLoginService = require('../services/auth-login.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const AppError = require('../../../../../shared/utils/app-error.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');
const { jwt: jwtConfig, AUTH_ERROR_CODES } = require('../../../../../shared/constants');

// ============================================================
// COOKIE CONFIG
// ============================================================

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/'
};

// El maxAge de cada cookie sigue la vida REAL de su token. Tenerlas vivas más tiempo que el token
// que transportan hace que el navegador siga mandando credenciales muertas y que el front crea que
// hay sesión cuando ya no la hay.
const ACCESS_TOKEN_TTL = jwtConfig.accessTokenExpiry; // 15 min — exp del access token RS256
const REFRESH_TOKEN_TTL_HOURS = 24;
const REFRESH_TOKEN_TTL = REFRESH_TOKEN_TTL_HOURS * 60 * 60; // 24h — exp del refresh y TTL del JTI en Redis

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

// clearCookie solo borra si los atributos coinciden con los del Set-Cookie original: sin
// sameSite/secure, varios navegadores dejan la cookie viva y la sesión "cerrada" sigue mandando
// credenciales. Se repiten los mismos COOKIE_OPTIONS (sin maxAge, que no participa del match).
const _clearAuthCookies = res => {
  res.clearCookie('access_token', COOKIE_OPTIONS);
  res.clearCookie('id_token', COOKIE_OPTIONS); // ← limpia cookie legacy durante migración
  res.clearCookie('refresh_token', COOKIE_OPTIONS);
};

/**
 * ¿El request viene de un cliente web (cookies) o de mobile (headers)?
 *
 * El header `x-client-type` sigue mandando cuando está presente, pero no puede ser la única
 * señal: si el interceptor del front lo omite en /auth/refresh —cosa que pasa—, el back rotaba
 * el token y NO devolvía las cookies nuevas, dejando al navegador con un refresh ya revocado que
 * en la siguiente llamada se leía como reuse attack. La presencia de la cookie es la evidencia
 * directa de que hablamos con un navegador.
 */
const _isWebClient = req => {
  if (req.headers['x-client-type'] === 'web') {
    return true;
  }
  return Boolean(req.cookies?.refresh_token || req.cookies?.access_token);
};

const _extractAccessToken = (req, clientType) => {
  if (clientType === 'web') {
    return req.cookies?.access_token || null;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return null;
  }
  const parts = authHeader.split(' ');
  return parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : null;
};

// ============================================================
// CONTROLLER
// ============================================================

class AuthLoginController {
  /**
   * POST /auth/login
   * Web:    setea cookies httpOnly + devuelve tokens en body
   * Mobile: devuelve tokens en body solamente
   */
  login = asyncHandler(async (req, res) => {
    const clientType = req.headers['x-client-type'];

    const result = await AuthLoginService.login(req.body, {
      ip: res.locals.auditContext?.ip,
      userAgent: res.locals.auditContext?.userAgent,
      fingerprintHash: res.locals.fingerprintHash,
      clientType,
      serverContext: req.serverContext || null,
      pushToken: req.body.pushToken || null,
      pushDeviceId: req.body.pushDeviceId || null,
      pushPlatform: req.body.pushPlatform || null
    });

    if (result.requiresMFA || result.requiresDeviceApproval || result.requiresPolicyAcceptance) {
      return ApiResponse.success(res, 'Inicio de sesión exitoso', result);
    }

    if (_isWebClient(req)) {
      _setAuthCookies(res, result.tokens);
    }

    return ApiResponse.success(res, 'Inicio de sesión exitoso', result);
  });

  /** POST /auth/verify-mfa */
  verifyMFA = asyncHandler(async (req, res) => {
    const result = await AuthLoginService.verifyMFA(req.body, {
      ip: res.locals.auditContext?.ip,
      userAgent: res.locals.auditContext?.userAgent,
      fingerprintHash: res.locals.fingerprintHash,
      serverContext: req.serverContext || null,
      pushToken: req.body.pushToken || null,
      pushDeviceId: req.body.pushDeviceId || null,
      pushPlatform: req.body.pushPlatform || null
    });

    if (_isWebClient(req)) {
      _setAuthCookies(res, result.tokens);
    }

    return ApiResponse.success(res, 'Verificación MFA exitosa', result);
  });

  /**
   * POST /auth/refresh
   * No requiere access token válido (puede estar expirado).
   * Se autentica únicamente con el refresh token.
   * Web:    refresh token desde cookie
   * Mobile: refresh token desde header X-Refresh-Token
   */
  refreshToken = asyncHandler(async (req, res) => {
    // Se lee de donde esté, sin depender del header: la cookie manda en web y el header en mobile.
    // Antes, si el interceptor no mandaba x-client-type, el back leía el header inexistente y
    // respondía 401 con la cookie válida ahí adelante.
    const isWeb = _isWebClient(req);
    const refreshTkn = req.cookies?.refresh_token || req.headers['x-refresh-token'] || null;

    if (!refreshTkn) {
      throw AppError.unauthorized(isWeb ? 'Cookie refresh_token no encontrada' : 'Header X-Refresh-Token no proporcionado', {
        code: AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID
      });
    }

    const result = await AuthLoginService.refreshToken(refreshTkn);

    if (isWeb) {
      _setAuthCookies(res, result);
    }

    return ApiResponse.success(res, 'Token renovado exitosamente', result);
  });

  /** POST /auth/logout */
  logout = asyncHandler(async (req, res) => {
    const isWeb = _isWebClient(req);

    const accessToken = _extractAccessToken(req, isWeb ? 'web' : 'mobile');
    const refreshToken = req.cookies?.refresh_token || req.headers['x-refresh-token'] || null;

    await AuthLoginService.logout(req.user.userId, res.locals.fingerprintHash, {
      accessToken,
      tokenExp: req.user.tokenExp,
      refreshToken,
      sessionId: req.user.sessionId || null
    });

    if (isWeb) {
      _clearAuthCookies(res);
    }

    return ApiResponse.success(res, 'Sesión cerrada exitosamente');
  });

  /** POST /auth/logout-all */
  logoutAll = asyncHandler(async (req, res) => {
    const isWeb = _isWebClient(req);

    const accessToken = _extractAccessToken(req, isWeb ? 'web' : 'mobile');

    await AuthLoginService.logoutAll(req.user.userId, {
      accessToken,
      tokenExp: req.user.tokenExp,
      firstName: req.user.firstName
    });

    if (isWeb) {
      _clearAuthCookies(res);
    }

    return ApiResponse.success(res, 'Sesión cerrada en todos los dispositivos');
  });

  // ============================================================
  // DISPOSITIVOS
  // ============================================================

  /** GET /auth/devices */
  getTrustedDevices = asyncHandler(async (req, res) => {
    const result = await AuthLoginService.getTrustedDevices(
      req.user.userId,
      res.locals.fingerprintHash,
      req.user.sessionId || null
    );
    return ApiResponse.success(res, 'Dispositivos obtenidos exitosamente', result);
  });

  /** DELETE /auth/sessions/:sessionId */
  closeSession = asyncHandler(async (req, res) => {
    const result = await AuthLoginService.closeSessionById(req.user.userId, req.params.sessionId, req.user.sessionId || null);
    return ApiResponse.success(res, 'Sesión cerrada exitosamente', result);
  });

  /** POST /auth/logout-others */
  logoutOthers = asyncHandler(async (req, res) => {
    const result = await AuthLoginService.closeOtherSessions(req.user.userId, req.user.sessionId || null);
    return ApiResponse.success(res, 'Todas las demás sesiones han sido cerradas', result);
  });

  /** GET /auth/devices/pending */
  getPendingDevices = asyncHandler(async (req, res) => {
    const result = await AuthLoginService.getPendingDevices(req.user.userId);
    return ApiResponse.success(res, 'Dispositivos pendientes de aprobación', result);
  });

  /** PATCH /auth/devices/:deviceId */
  renameDevice = asyncHandler(async (req, res) => {
    const result = await AuthLoginService.renameDevice(req.user.userId, req.params.deviceId, req.body.deviceName);
    return ApiResponse.success(res, 'Dispositivo renombrado exitosamente', result);
  });

  /** POST /auth/devices/:deviceId/approve */
  approveDevice = asyncHandler(async (req, res) => {
    const result = await AuthLoginService.approveDevice(req.user.userId, req.params.deviceId, res.locals.fingerprintHash);
    return ApiResponse.success(res, 'Dispositivo aprobado exitosamente', result);
  });

  /** POST /auth/devices/:deviceId/block */
  blockDevice = asyncHandler(async (req, res) => {
    const result = await AuthLoginService.blockDevice(req.user.userId, req.params.deviceId, res.locals.fingerprintHash);
    return ApiResponse.success(res, 'Dispositivo bloqueado exitosamente', result);
  });

  /** POST /auth/devices/:deviceId/unblock */
  unblockDevice = asyncHandler(async (req, res) => {
    const result = await AuthLoginService.unblockDevice(req.user.userId, req.params.deviceId, res.locals.fingerprintHash);
    return ApiResponse.success(res, 'Dispositivo desbloqueado exitosamente', result);
  });
}

module.exports = new AuthLoginController();
