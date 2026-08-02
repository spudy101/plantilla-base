// servers/client.js
const { server } = require('../shared/constants');
const BaseServer = require('../shared/base/base.server');
const clientApp = require('../modules/client/app');

class ClientServer extends BaseServer {
  get port() {
    return server.port;
  }
  get serverLabel() {
    return 'CLIENT SERVER';
  }
  createHttpServer() {
    return clientApp;
  }
}

const clientServer = new ClientServer();
clientServer.start();

module.exports = clientServer;
