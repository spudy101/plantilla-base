import kycModule = require('../../../../shared/dtos/kyc');
const { VerificationCodeComponent } = kycModule;

function SendVerificationResponseDTO({
  verificationCode,
  truncatedCode
}: {
  verificationCode: NonNullable<Parameters<typeof VerificationCodeComponent.build>[0]>;
  /** Solo en entornos no productivos (para pruebas sin SMS/email real) */
  truncatedCode?: string | null;
}) {
  const built = VerificationCodeComponent.build(verificationCode);
  const result: { verificationCodeId: string | undefined; expiresAt: unknown; truncatedCode?: string } = {
    verificationCodeId: built?.verificationCodeId,
    expiresAt: built?.expiresAt
  };
  if (truncatedCode) {
    result.truncatedCode = truncatedCode;
  }
  return result;
}

function VerifyCodeResponseDTO() {
  return { verified: true };
}

export = {
  SendVerificationResponseDTO,
  VerifyCodeResponseDTO
};
