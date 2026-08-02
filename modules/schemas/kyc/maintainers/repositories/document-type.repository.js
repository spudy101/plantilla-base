// modules/schemas/kyc/repositories/document-type.repository.js

const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { DocumentType } = require('../../../../../shared/models');

class DocumentTypeRepository extends BaseRepository {
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
  findByCode(code) {
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

module.exports = new DocumentTypeRepository();
