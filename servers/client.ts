// servers/client.ts
import constantsModule = require('../shared/constants');
const { server } = constantsModule;
import BaseServer = require('../shared/base/base.server');
import clientApp = require('../modules/client/app');

class ClientServer extends BaseServer {
  override get port() {
    return server.port;
  }
  override get serverLabel() {
    return 'CLIENT SERVER';
  }
  override createHttpServer() {
    return clientApp;
  }
}

const clientServer = new ClientServer();
clientServer.start();

export = clientServer;
