// modules/schemas/kyc/repositories/document-type.repository.ts

import BaseRepository = require('../../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../../shared/models');
const { DocumentType } = modelsModule;
import type defineDocumentType = require('../models/document-type.model');

class DocumentTypeRepository extends BaseRepository<defineDocumentType.Instance> {
  constructor() {
    super(DocumentType, {
      searchFields: ['name', 'code']
    });
  }

  /**
   * Busca un tipo de documento por su sigla (code)
   * @param {string} code - Ej: 'CC', 'CE', 'TI'
   * @returns {Promise<DocumentType|null>}
   */
  findByCode(code: string) {
    return DocumentType.findOne({ where: { code, is_active: true } });
  }

  /**
   * Lista solo los tipos visibles al cliente (para el selector del formulario)
   * @returns {Promise<DocumentType[]>}
   */
  findAllVisibleToClient() {
    return DocumentType.findAll({
      where: { is_visible_to_client: true, is_active: true },
      order: [['name', 'ASC']]
    });
  }
}

export = new DocumentTypeRepository();
