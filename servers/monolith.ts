// servers/monolith.ts
import express from 'express';
import cookieParser from 'cookie-parser';

import constantsModule from '../shared/constants';
const { server } = constantsModule;
import BaseServer from '../shared/base/base.server';
import redisClient from '../shared/utils/redis.util';
import db from '../shared/models';
import clientApp from '../modules/client/app';
import adminApp from '../modules/admin/app';
import packageModule from '../package.json';
const { version } = packageModule;

class MonolithServer extends BaseServer {
  override get port() {
    return server.port;
  }
  override get serverLabel() {
    return 'MONOLITH SERVER';
  }

  override createHttpServer() {
    const app = express();

    app.use(cookieParser());

    // Health check centralizado (incluye ambos sub-servicios)
    app.get('/health', async (req, res) => {
      const checks: Record<string, { status: 'healthy' | 'unhealthy' | 'degraded'; responseTimeMs?: number; note?: string }> = {};

      const dbStart = Date.now();
      try {
        await db.sequelize.authenticate();
        checks.database = { status: 'healthy', responseTimeMs: Date.now() - dbStart };
      } catch {
        checks.database = { status: 'unhealthy', responseTimeMs: Date.now() - dbStart };
      }

      checks.redis = redisClient.isAvailable() ? { status: 'healthy' } : { status: 'degraded', note: 'single-instance mode' };

      const hasUnhealthy = Object.values(checks).some(c => c.status === 'unhealthy');
      const hasDegraded = Object.values(checks).some(c => c.status === 'degraded');
      const overallStatus = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

      return res.status(hasUnhealthy ? 503 : 200).json({
        status: overallStatus,
        service: 'monolith',
        version,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        checks,
        services: { client: 'running', admin: 'running' }
      });
    });

    app.get('/', (req, res) =>
      res.status(200).json({
        success: true,
        message: 'Welcome to Base Project API — Monolith Mode',
        version,
        mode: 'monolith',
        endpoints: { client: '/client', admin: '/admin', health: '/health' },
        docs: { client: '/client/docs', admin: '/admin/docs' }
      })
    );

    app.use('/admin', adminApp);
    app.use('/client', clientApp);

    app.use((req, res) =>
      res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.path
      })
    );

    return app;
  }
}

const monolithServer = new MonolithServer();
monolithServer.start();

export default monolithServer;
