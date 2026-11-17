// servers/admin.ts
import constantsModule = require('../shared/constants');
const { server } = constantsModule;
import BaseServer = require('../shared/base/base.server');
import adminApp = require('../modules/admin/app');

class AdminServer extends BaseServer {
  override get port() {
    return server.port;
  }
  override get serverLabel() {
    return 'ADMIN SERVER';
  }
  override createHttpServer() {
    return adminApp;
  }
}

const adminServer = new AdminServer();
adminServer.start();

export = adminServer;
