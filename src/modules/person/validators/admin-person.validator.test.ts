// tests/unit/modules/admin/kyc/person/validators/admin-person.validator.test.ts
//
// sortBy del listado de personas (fase 6b de docs/prisma-migration.md): el contrato es camelCase
// (createdAt, updatedAt, isActive) y los nombres de columna se siguen aceptando por compatibilidad.
// Se ejecutan los chains reales contra un req simulado. NO se toca red ni BD.

import type { ValidationChain } from 'express-validator';
import { validationResult } from 'express-validator';
import PersonValidator from './admin-person.validator';

async function sortByErrors(sortBy: string) {
  const req = { query: { sortBy }, body: {}, params: {}, headers: {} };
  for (const chain of PersonValidator.listQuery() as ValidationChain[]) {
    await chain.run(req);
  }
  return validationResult(req)
    .array()
    .filter(e => e.type === 'field' && e.path === 'sortBy');
}

describe('PersonValidator.listQuery — sortBy', () => {
  it.each(['username', 'createdAt', 'updatedAt', 'isActive'])('acepta el campo en camelCase %s', async value => {
    expect(await sortByErrors(value)).toHaveLength(0);
  });

  it.each(['created_at', 'updated_at', 'is_active'])('sigue aceptando el nombre de columna %s (compatibilidad)', async value => {
    expect(await sortByErrors(value)).toHaveLength(0);
  });

  it('rechaza un campo fuera de la lista y sugiere los nombres en camelCase', async () => {
    const errors = await sortByErrors('password_hash');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.msg).toEqual(
      expect.objectContaining({ message: 'sortBy debe ser: username, createdAt, updatedAt o isActive' })
    );
  });
});
