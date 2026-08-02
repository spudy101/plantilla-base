// tests/unit/shared/aws-provider-meta.util.test.js
//
// aws-provider-meta: helpers para homologar los logs de integración AWS.
// resolveAwsGate es un stub del template (el catálogo de partners no forma parte
// de la base) → siempre nulls, nunca lanza. awsErrorCode normaliza el error del
// SDK v3 a su `name` o, en su defecto, al status HTTP del $metadata.

const { resolveAwsGate, awsErrorCode } = require('shared/utils/aws-provider-meta.util');

describe('aws-provider-meta.util', () => {
  describe('resolveAwsGate', () => {
    it('devuelve { integrationId: null, unitCost: null } para cualquier code', async () => {
      await expect(resolveAwsGate('ses')).resolves.toEqual({ integrationId: null, unitCost: null });
      await expect(resolveAwsGate('s3')).resolves.toEqual({ integrationId: null, unitCost: null });
    });

    it('no lanza aunque el code sea undefined/null', async () => {
      await expect(resolveAwsGate()).resolves.toEqual({ integrationId: null, unitCost: null });
      await expect(resolveAwsGate(null)).resolves.toEqual({ integrationId: null, unitCost: null });
    });
  });

  describe('awsErrorCode', () => {
    it('usa error.name cuando existe (ej: MessageRejected, NoSuchKey)', () => {
      expect(awsErrorCode({ name: 'MessageRejected' })).toBe('MessageRejected');
      expect(awsErrorCode({ name: 'NoSuchKey' })).toBe('NoSuchKey');
    });

    it('cae al httpStatusCode del $metadata cuando no hay name', () => {
      expect(awsErrorCode({ $metadata: { httpStatusCode: 503 } })).toBe(503);
    });

    it('el name tiene prioridad sobre el status del $metadata', () => {
      expect(awsErrorCode({ name: 'Throttling', $metadata: { httpStatusCode: 400 } })).toBe('Throttling');
    });

    it('devuelve null si no hay name ni status', () => {
      expect(awsErrorCode({})).toBeNull();
      expect(awsErrorCode({ $metadata: {} })).toBeNull();
    });

    it('devuelve null ante error nulo/undefined (no lanza)', () => {
      expect(awsErrorCode(null)).toBeNull();
      expect(awsErrorCode(undefined)).toBeNull();
    });
  });
});
