// modules/schemas/kyc/src/repositories/avatar-theme.repository.ts
import BaseRepository from '../../../../../shared/repositories/base.repository';
import modelsModule from '../../../../../shared/models';
const { AvatarTheme } = modelsModule;
import type defineAvatarTheme from '../models/avatar-theme.model';

class AvatarThemeRepository extends BaseRepository<defineAvatarTheme.Instance> {
  constructor() {
    super(AvatarTheme, { searchFields: ['name'] });
  }
}

export default new AvatarThemeRepository();
