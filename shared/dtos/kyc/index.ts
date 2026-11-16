import EncryptionUtil = require('../../utils/encryption.util');
import componentsPerson = require('./components-person.dto');
import componentsAuth = require('./components-auth.dto');
import componentsCatalog = require('./components-catalog.dto');

function safeDecrypt(value: unknown) {
  return EncryptionUtil.safeDecrypt(value);
}

export = {
  ...componentsPerson,
  ...componentsAuth,
  ...componentsCatalog,
  safeDecrypt
};
