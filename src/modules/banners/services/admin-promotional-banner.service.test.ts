// tests/unit/modules/admin/core/services/promotional-banner.service.test.ts
//
// PromotionalBannerService — mantenedor del catálogo de banners promocionales (JSONB en SystemGlobalConfig).
// Probamos: list (404 sin config activa + camino feliz), replace (normalización snake_case + bump de versión
// + limpieza de imágenes huérfanas gestionadas, ignorando URLs externas + warn en borrado parcial), y
// uploadImage (validación de buffer, key con uuid y extensión normalizada jpeg→jpg). S3, modelos, uuid y DTOs mockeados.

jest.mock('uuid', () => ({ v4: jest.fn(() => 'uuid-generado') }));

jest.mock('../../../shared/infra/s3.util', () => ({
  uploadPublicDocument: jest.fn().mockResolvedValue('https://cdn.test/promotional/banners/uuid-generado.jpg'),
  deletePublicFile: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../shared/observability/logger.util', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logAudit: jest.fn()
}));

jest.mock('../../settings/repositories/system-global-config.repository', () => ({ findActive: jest.fn(), update: jest.fn() }));

jest.mock('../dtos/admin-promotional-banner.dto', () => ({
  PromotionalBannerListDTO: jest.fn(banners => ({ banners })),
  PromotionalBannerImageDTO: jest.fn((imageUrl, s3Key) => ({ imageUrl, s3Key }))
}));

import { mocked, fixture, Loose } from 'tests/helpers/mock';
import uuidModule from 'uuid';
const { v4: uuidv4 } = mocked(uuidModule);
import S3UtilModule from '../../../shared/infra/s3.util';
const S3Util = mocked(S3UtilModule);
import loggerUtilModule from '../../../shared/observability/logger.util';
const { logAudit, logger } = mocked(loggerUtilModule);
import systemGlobalConfigRepositoryModule from '../../settings/repositories/system-global-config.repository';
const systemGlobalConfigRepository = mocked(systemGlobalConfigRepositoryModule);
import promotionalBannerDtoModule from '../dtos/admin-promotional-banner.dto';
const { PromotionalBannerListDTO, PromotionalBannerImageDTO } = mocked(promotionalBannerDtoModule);
import service from './admin-promotional-banner.service';

const ADMIN_ID = 'admin-1';
const PREFIX = 'promotional/banners';

describe('PromotionalBannerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uuidv4.mockReturnValue('uuid-generado');
  });

  describe('list', () => {
    it('lanza 404 cuando no hay configuración global activa', async () => {
      systemGlobalConfigRepository.findActive.mockResolvedValue(null);

      await expect(service.list(ADMIN_ID)).rejects.toThrow('No hay una configuración global activa');
    });

    it('devuelve los banners de la config activa y audita', async () => {
      systemGlobalConfigRepository.findActive.mockResolvedValue({ configId: 'cfg-1', promotionalBanners: [{ id: 'b1' }] });

      const result = await service.list(ADMIN_ID);

      expect(logAudit).toHaveBeenCalledWith(
        'PROMOTIONAL_BANNERS_VIEWED_ADMIN',
        ADMIN_ID,
        {},
        expect.objectContaining({ entityId: 'cfg-1' })
      );
      expect(PromotionalBannerListDTO).toHaveBeenCalledWith([{ id: 'b1' }]);
      expect(result).toEqual({ banners: [{ id: 'b1' }] });
    });

    it('usa arreglo vacío cuando promotional_banners es null', async () => {
      systemGlobalConfigRepository.findActive.mockResolvedValue({ configId: 'cfg-1', promotionalBanners: null });

      await service.list(ADMIN_ID);

      expect(PromotionalBannerListDTO).toHaveBeenCalledWith([]);
    });
  });

  describe('replace', () => {
    it('normaliza a snake_case, genera ids faltantes, sube versión y audita', async () => {
      systemGlobalConfigRepository.update.mockImplementation(async (_id: string, p: Loose) => ({ promotionalBanners: p.promotionalBanners }));
      systemGlobalConfigRepository.findActive.mockResolvedValue({
        configId: 'cfg-1',
        configVersion: 4,
        promotionalBanners: []
      });

      await service.replace(
        [{ title: 'T', text: 'X', buttonRoute: '/go', buttonName: 'Ir', imageUrl: null, isActive: false }],
        ADMIN_ID
      );

      expect(systemGlobalConfigRepository.update).toHaveBeenCalledWith('cfg-1', expect.any(Object));
      const payload = systemGlobalConfigRepository.update.mock.calls[0][1];
      expect(payload.configVersion).toEqual({ increment: 1 }); // se incrementa en la base
      expect(payload.promotionalBanners[0]).toEqual(
        expect.objectContaining({
          id: 'uuid-generado',
          title: 'T',
          button_route: '/go',
          button_name: 'Ir',
          is_active: false,
          sort_order: 1
        })
      );
      expect(logAudit).toHaveBeenCalledWith(
        'PROMOTIONAL_BANNERS_UPDATED',
        ADMIN_ID,
        expect.objectContaining({ total: 1, active: 0, imagesRemoved: 0 }),
        expect.anything()
      );
    });

    it('borra de S3 las imágenes gestionadas que quedaron huérfanas e ignora las externas', async () => {
      const orphanManaged = `https://cdn.test/${PREFIX}/vieja.png`;
      const externalUrl = 'https://marca.externa.com/logo.png';
      systemGlobalConfigRepository.update.mockImplementation(async (_id: string, p: Loose) => ({ promotionalBanners: p.promotionalBanners }));
      systemGlobalConfigRepository.findActive.mockResolvedValue({
        configId: 'cfg-1',
        configVersion: 1,
        promotionalBanners: [{ image_url: orphanManaged }, { image_url: externalUrl }]
      });

      // El nuevo catálogo no referencia ninguna imagen → la gestionada queda huérfana.
      await service.replace([{ title: 'T', text: 'X' }], ADMIN_ID);

      expect(S3Util.deletePublicFile).toHaveBeenCalledTimes(1);
      expect(S3Util.deletePublicFile).toHaveBeenCalledWith(`${PREFIX}/vieja.png`);
      expect(logAudit).toHaveBeenCalledWith(
        'PROMOTIONAL_BANNERS_UPDATED',
        ADMIN_ID,
        expect.objectContaining({ imagesRemoved: 1 }),
        expect.anything()
      );
    });

    it('registra warn si algún borrado de imagen huérfana falla (best-effort)', async () => {
      systemGlobalConfigRepository.update.mockImplementation(async (_id: string, p: Loose) => ({ promotionalBanners: p.promotionalBanners }));
      systemGlobalConfigRepository.findActive.mockResolvedValue({
        configId: 'cfg-1',
        configVersion: 1,
        promotionalBanners: [{ image_url: `https://cdn.test/${PREFIX}/a.png` }, { image_url: `https://cdn.test/${PREFIX}/b.png` }]
      });
      S3Util.deletePublicFile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('s3 fail'));

      await service.replace([{ title: 'T', text: 'X' }], ADMIN_ID);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Limpieza de imágenes'),
        expect.objectContaining({ deleted: 1, failed: 1 })
      );
    });
  });

  describe('uploadImage', () => {
    it('lanza 400 cuando no viene el buffer del archivo', async () => {
      await expect(service.uploadImage(fixture({}), ADMIN_ID)).rejects.toThrow('La imagen del banner es requerida');
      await expect(service.uploadImage(null, ADMIN_ID)).rejects.toThrow('La imagen del banner es requerida');
    });

    it('sube al bucket público con key uuid y normaliza jpeg→jpg', async () => {
      const file = { buffer: Buffer.from('img'), mimetype: 'image/jpeg' };

      const result = await service.uploadImage(file, ADMIN_ID);

      const expectedKey = `${PREFIX}/uuid-generado.jpg`;
      expect(S3Util.uploadPublicDocument).toHaveBeenCalledWith(file.buffer, expectedKey, 'image/jpeg');
      expect(logAudit).toHaveBeenCalledWith(
        'PROMOTIONAL_BANNER_IMAGE_UPLOADED',
        ADMIN_ID,
        { s3Key: expectedKey },
        expect.anything()
      );
      expect(PromotionalBannerImageDTO).toHaveBeenCalledWith(
        'https://cdn.test/promotional/banners/uuid-generado.jpg',
        expectedKey
      );
      expect(result).toEqual({
        imageUrl: 'https://cdn.test/promotional/banners/uuid-generado.jpg',
        s3Key: expectedKey
      });
    });

    it('usa png por defecto cuando no hay mimetype', async () => {
      const file = { buffer: Buffer.from('img') };

      await service.uploadImage(fixture(file), ADMIN_ID);

      expect(S3Util.uploadPublicDocument).toHaveBeenCalledWith(file.buffer, `${PREFIX}/uuid-generado.png`, undefined);
    });
  });
});
