// modules/schemas/kyc/src/repositories/avatar.repository.ts
import BaseRepository from '../../../../../shared/repositories/base.repository';
import modelsModule from '../../../../../shared/models';
const { Avatar } = modelsModule;
import type defineAvatar from '../models/avatar.model';

class AvatarRepository extends BaseRepository<defineAvatar.Instance> {
  constructor() {
    super(Avatar, {
      searchFields: ['name'],
      filterIdField: 'avatar_theme_id',
      filterIdKey: 'themeId',
      defaultInclude: [{ association: 'theme', attributes: ['avatar_theme_id', 'name'] }]
    });
  }
}

export default new AvatarRepository();
