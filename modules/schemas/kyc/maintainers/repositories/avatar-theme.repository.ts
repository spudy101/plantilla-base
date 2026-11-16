// modules/schemas/kyc/src/repositories/avatar-theme.repository.ts
import BaseRepository = require('../../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../../shared/models');
const { AvatarTheme } = modelsModule;
import type defineAvatarTheme = require('../models/avatar-theme.model');

class AvatarThemeRepository extends BaseRepository<defineAvatarTheme.Instance> {
  constructor() {
    super(AvatarTheme, { searchFields: ['name'] });
  }
}

export = new AvatarThemeRepository();
