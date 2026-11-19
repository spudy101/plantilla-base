// Código de error normalizado de un error del AWS SDK v3 (ej: 'MessageRejected', 'NoSuchKey') o, si no
// hay nombre, el status HTTP del $metadata. Lo guarda callProvider en integration_api_logs.
function awsErrorCode(error: unknown): string | number | null {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null | undefined;
  return e?.name || e?.$metadata?.httpStatusCode || null;
}

export default { awsErrorCode };
