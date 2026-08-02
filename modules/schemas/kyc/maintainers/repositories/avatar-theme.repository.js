// modules/schemas/kyc/src/repositories/avatar-theme.repository.js
const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { AvatarTheme } = require('../../../../../shared/models');

class AvatarThemeRepository extends BaseRepository {
  constructor() {
    super(AvatarTheme, { searchFields: ['name'] });
  }
}

module.exports = new AvatarThemeRepository();
