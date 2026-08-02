const { VerificationCodeComponent } = require('../../../../shared/dtos/kyc');

function SendVerificationResponseDTO({ verificationCode, truncatedCode }) {
  const built = VerificationCodeComponent.build(verificationCode);
  const result = {
    verificationCodeId: built.verificationCodeId,
    expiresAt: built.expiresAt
  };
  if (truncatedCode) {
    result.truncatedCode = truncatedCode;
  }
  return result;
}

function VerifyCodeResponseDTO() {
  return { verified: true };
}

module.exports = {
  SendVerificationResponseDTO,
  VerifyCodeResponseDTO
};
