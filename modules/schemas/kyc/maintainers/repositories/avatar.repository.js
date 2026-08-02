// modules/schemas/kyc/src/repositories/avatar.repository.js
const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { Avatar } = require('../../../../../shared/models');

class AvatarRepository extends BaseRepository {
  constructor() {
    super(Avatar, {
      searchFields: ['name'],
      filterIdField: 'avatar_theme_id',
      filterIdKey: 'themeId',
      defaultInclude: [{ association: 'theme', attributes: ['avatar_theme_id', 'name'] }]
    });
  }
}

module.exports = new AvatarRepository();
