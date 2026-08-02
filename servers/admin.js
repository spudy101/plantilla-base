// servers/admin.js
const { server } = require('../shared/constants');
const BaseServer = require('../shared/base/base.server');
const adminApp = require('../modules/admin/app');

class AdminServer extends BaseServer {
  get port() {
    return server.port;
  }
  get serverLabel() {
    return 'ADMIN SERVER';
  }
  createHttpServer() {
    return adminApp;
  }
}

const adminServer = new AdminServer();
adminServer.start();

module.exports = adminServer;
