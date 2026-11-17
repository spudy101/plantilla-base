// shared/utils/aws-provider-meta.util.ts
//
// Homologa los registros de integración AWS (ses / s3 / sns) con los de los demás
// proveedores externos: resuelve el integration_id del catálogo y normaliza el error_code
// del SDK v3 para que el dashboard de integraciones pueda agrupar y diagnosticar los
// consumos AWS igual que los demás proveedores.
//
// IMPORTANTE: AWS nunca se bloquea (su registro de integración tiene is_enforced=false → el guard hace
// fail-open). Este helper usa IntegrationGuard SOLO para resolver integrationId/unitCost;
// el `allowed` del guard se ignora — estas utils no gatean por estado.

// Resuelve { integrationId, unitCost } para un code de integración AWS.
// Nunca lanza: ante cualquier error devuelve nulls (el log se persiste igual).
// eslint-disable-next-line no-unused-vars, require-await
async function resolveAwsGate(_code?: string): Promise<{ integrationId: string | null; unitCost: number | null }> {
  // El catálogo de integraciones (partners) no forma parte del template base.
  // Se conserva la firma para no romper call-sites de logging de AWS.
  return { integrationId: null, unitCost: null };
}

// Código de error normalizado de un error del AWS SDK v3 (ej: 'MessageRejected', 'NoSuchKey')
// o, si no hay nombre, el status HTTP del $metadata.
function awsErrorCode(error: unknown): string | number | null {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null | undefined;
  return e?.name || e?.$metadata?.httpStatusCode || null;
}

export default { resolveAwsGate, awsErrorCode };
