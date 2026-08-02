// servers/monolith.js
const express = require('express');
const cookieParser = require('cookie-parser');

const { server } = require('../shared/constants');
const BaseServer = require('../shared/base/base.server');
const redisClient = require('../shared/utils/redis.util');
const db = require('../shared/models');
const clientApp = require('../modules/client/app');
const adminApp = require('../modules/admin/app');
const { version } = require('../package.json');

class MonolithServer extends BaseServer {
  get port() {
    return server.port;
  }
  get serverLabel() {
    return 'MONOLITH SERVER';
  }

  createHttpServer() {
    const app = express();

    app.use(cookieParser());

    // Health check centralizado (incluye ambos sub-servicios)
    app.get('/health', async (req, res) => {
      const checks = {};

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

module.exports = monolithServer;
