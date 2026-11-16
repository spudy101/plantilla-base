// shared/utils/auth-user.util.ts
//
// `req.user` es opcional en el tipo de Express (solo existe después de AuthMiddleware). Los middlewares y
// controllers que corren DETRÁS de la autenticación lo usan con esta función: devuelve el usuario tipado
// o lanza 401 si la ruta quedó mal configurada (antes eso terminaba en un TypeError → 500).
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/express';
import AppError = require('./app-error.util');

function requireAuthUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw AppError.unauthorized('Usuario no autenticado');
  }
  return req.user;
}

export = { requireAuthUser };
