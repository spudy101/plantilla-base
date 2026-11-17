import EncryptionUtil from '../../utils/encryption.util';
import componentsPerson from './components-person.dto';
import componentsAuth from './components-auth.dto';
import componentsCatalog from './components-catalog.dto';

function safeDecrypt(value: unknown) {
  return EncryptionUtil.safeDecrypt(value);
}

export default {
  ...componentsPerson,
  ...componentsAuth,
  ...componentsCatalog,
  safeDecrypt
};
