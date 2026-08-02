const EncryptionUtil = require('../../utils/encryption.util');

function safeDecrypt(value) {
  return EncryptionUtil.safeDecrypt(value);
}

module.exports = {
  ...require('./components-person.dto'),
  ...require('./components-auth.dto'),
  ...require('./components-catalog.dto'),
  safeDecrypt
};
