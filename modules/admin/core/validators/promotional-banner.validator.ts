import { body } from 'express-validator';
import BaseValidator from '../../../../shared/validators/base.validator';

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

class PromotionalBannerValidator extends BaseValidator {
  /** PUT /promotional-banners */
  static replace() {
    return [
      body('banners').isArray({ max: 20 }).withMessage('banners debe ser un arreglo (máximo 20 elementos)'),
      body('banners.*.id').optional({ nullable: true }).isUUID().withMessage('id debe ser un UUID'),
      body('banners.*.title')
        .isString()
        .trim()
        .isLength({ min: 1, max: 120 })
        .withMessage('title es requerido (máximo 120 caracteres)'),
      body('banners.*.text')
        .isString()
        .trim()
        .isLength({ min: 1, max: 500 })
        .withMessage('text es requerido (máximo 500 caracteres)'),
      body('banners.*.tag')
        .optional({ nullable: true })
        .isString()
        .trim()
        .isLength({ max: 40 })
        .withMessage('tag admite máximo 40 caracteres'),
      body('banners.*.buttonRoute')
        .optional({ nullable: true })
        .isString()
        .trim()
        .isLength({ max: 200 })
        .withMessage('buttonRoute admite máximo 200 caracteres'),
      body('banners.*.buttonName')
        .optional({ nullable: true })
        .isString()
        .trim()
        .isLength({ max: 60 })
        .withMessage('buttonName admite máximo 60 caracteres'),
      body('banners.*.imageUrl')
        .optional({ nullable: true })
        .isString()
        .trim()
        .isLength({ max: 500 })
        .withMessage('imageUrl admite máximo 500 caracteres'),
      body('banners.*.isActive').optional().isBoolean().withMessage('isActive debe ser booleano').toBoolean(),
      body('banners.*.sortOrder')
        .optional({ nullable: true })
        .isInt({ min: 1 })
        .withMessage('sortOrder debe ser un entero mayor a 0')
        .toInt()
    ];
  }

  /** POST /promotional-banners/image — el archivo llega por multipart (UploadMiddleware) */
  static uploadImage() {
    return [
      body().custom((_, { req }) => {
        const file = req.files?.image?.[0];
        if (!file) {
          throw new Error('La imagen es requerida (campo multipart "image")');
        }
        if (!IMAGE_MIMES.includes(file.mimetype)) {
          throw new Error('Formato de imagen no soportado: usa PNG, JPEG o WebP');
        }
        return true;
      })
    ];
  }
}

export default PromotionalBannerValidator;
