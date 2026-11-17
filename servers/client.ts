// servers/client.ts
import constantsModule from '../shared/constants';
const { server } = constantsModule;
import BaseServer from '../shared/base/base.server';
import clientApp from '../modules/client/app';

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

export default clientServer;
