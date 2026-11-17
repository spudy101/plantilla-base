// servers/admin.ts
import constantsModule from '../shared/constants';
const { server } = constantsModule;
import BaseServer from '../shared/base/base.server';
import adminApp from '../modules/admin/app';

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

export default adminServer;
