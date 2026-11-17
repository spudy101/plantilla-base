// tests/integration/legal-consents.test.ts
//
// Grupo 2 de la fase 5 (docs/prisma-migration.md) contra Postgres real: consentimientos y política de
// privacidad sobre Prisma. Cubre las escrituras de varios pasos (otorgar/revocar/publicar versión) y el
// motivo por el que el registro graba los consentimientos después del commit del alta mientras `users`
// siga en Sequelize.

import { randomUUID } from 'node:crypto';
import prisma from '../../shared/database/prisma';
import db from '../../shared/models';
import unitOfWork from '../../shared/database/unit-of-work';
import userConsentRepository from '../../modules/schemas/records/legal/repositories/user-consent.repository';
import privacyPolicyAdminRepository from '../../modules/schemas/records/legal/repositories/privacy-policy-admin.repository';
import privacyPolicyRepository from '../../modules/schemas/records/legal/repositories/privacy-policy.repository';

const TAG = `legal-it-${randomUUID().slice(0, 8)}`;
let roleId: string;
let consentTypeId: string;
let userId: string;
const personIds: string[] = [];

async function newPerson(): Promise<string> {
  const person = await prisma.person.create({ data: { firstName: 'Ada', lastName: TAG } });
  personIds.push(person.personId);
  return person.personId;
}

describe('Legal (consentimientos y política) · Prisma contra Postgres', () => {
  beforeAll(async () => {
    roleId = (await prisma.role.create({ data: { name: TAG } })).roleId;
    consentTypeId = (await prisma.consentType.create({ data: { code: TAG.toUpperCase(), name: TAG } })).consentTypeId;
    const personId = await newPerson();
    userId = (await prisma.user.create({ data: { username: TAG, personId, roleId } })).userId;
  });

  afterAll(async () => {
    await prisma.userConsent.deleteMany({ where: { consentTypeId } });
    await prisma.privacyPolicy.deleteMany({ where: { version: { startsWith: TAG.slice(-8) } } });
    await prisma.user.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.person.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.consentType.deleteMany({ where: { consentTypeId } });
    await prisma.role.deleteMany({ where: { roleId } });
    await prisma.$disconnect();
    await db.sequelize.close();
  });

  it('otorgar dos veces deja un solo consentimiento vigente; revocar lo cierra', async () => {
    const first = await userConsentRepository.grant({ userId, consentTypeId, ip: '1.1.1.1' });
    const second = await userConsentRepository.grant({ userId, consentTypeId, ip: '2.2.2.2' });

    const current = await userConsentRepository.findCurrentByUserAndType(userId, consentTypeId);
    expect(current?.userConsentId).toBe(second.userConsentId);
    expect((await prisma.userConsent.findUnique({ where: { userConsentId: first.userConsentId } }))?.isCurrent).toBe(false);

    const revoked = await userConsentRepository.revoke({ userId, consentTypeId, reason: 'test' });
    expect(revoked).toMatchObject({ userConsentId: second.userConsentId, isCurrent: false, revocationReason: 'test' });
    expect(revoked?.revokedAt).toBeInstanceOf(Date);
    expect(await userConsentRepository.findCurrentByUserAndType(userId, consentTypeId)).toBeNull();
    expect(await userConsentRepository.revoke({ userId, consentTypeId })).toBeNull();
  });

  it('el historial trae tipo, política y usuario con los mismos campos que en Sequelize', async () => {
    await userConsentRepository.grant({ userId, consentTypeId });
    const { rows, count } = await userConsentRepository.findHistoryByUser(userId);

    expect(count).toBe(rows.length);
    expect(rows[0]?.consentType).toEqual(expect.objectContaining({ consentTypeId, code: TAG.toUpperCase() }));
    expect(rows[0]?.user).toEqual({ userId, username: TAG, person: { firstName: 'Ada', lastName: TAG } });

    const filtered = await userConsentRepository.findAllPaginatedForAdmin({ userId, consentTypeCode: TAG.toUpperCase(), isCurrent: true });
    expect(filtered.count).toBe(1);
  });

  it('publicar una versión deja activa solo la nueva', async () => {
    const suffix = TAG.slice(-8);
    const before = await privacyPolicyRepository.findActive();
    try {
      await privacyPolicyAdminRepository.createVersion({ version: `${suffix}-a`, documentUrl: 'https://x/a.pdf', effectiveDate: new Date() });
      await privacyPolicyAdminRepository.createVersion({ version: `${suffix}-b`, documentUrl: 'https://x/b.pdf', effectiveDate: new Date() });

      expect(await prisma.privacyPolicy.count({ where: { isActive: true } })).toBe(1);
      expect((await privacyPolicyRepository.findActive())?.version).toBe(`${suffix}-b`);
    } finally {
      // Deja activa la que estaba (otros tests o la base de desarrollo pueden depender de ella)
      if (before) {
        await prisma.privacyPolicy.update({ where: { privacyPolicyId: before.privacyPolicyId }, data: { isActive: true } });
      }
    }
  });

  // Por qué auth-register graba los consentimientos después del commit: dentro de la misma unidad, el
  // INSERT de Prisma va por otra conexión y la FK a users no ve el usuario que Sequelize aún no confirmó.
  it('dentro de una unidad, un consentimiento de un usuario creado por Sequelize sin confirmar falla por FK', async () => {
    const personId = await newPerson();
    await expect(
      unitOfWork.run(async transaction => {
        const user = await db.User.create({ username: `${TAG}-sq`, person_id: personId, role_id: roleId, password_hash: 'x' }, { transaction });
        await userConsentRepository.grant({ userId: user.user_id, consentTypeId });
      })
    ).rejects.toThrow(/foreign key/i);
  });
});
