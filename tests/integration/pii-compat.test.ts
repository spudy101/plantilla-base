// tests/integration/pii-compat.test.ts
//
// Compatibilidad del cifrado de PII entre Sequelize (hooks de los modelos) y Prisma (piiExtension),
// contra Postgres real (esquema aislado de tests/test-env.ts; `npm run db:test:prepare`).
// Fase 4 de docs/prisma-migration.md: mientras conviven, cualquiera de los dos ORMs tiene que leer lo
// que escribió el otro, y los hashes de búsqueda tienen que coincidir (los repositorios filtran por ellos).

import { randomUUID } from 'node:crypto';
import prisma from '../../shared/database/prisma';
import { hashValue } from '../../shared/database/pii-fields';
import requestContext from '../../shared/utils/request-context.util';
import db from '../../shared/models';
import constants from '../../shared/constants';
import unitOfWork from '../../shared/database/unit-of-work';
import txContext from '../../shared/database/transaction-context';

const SCHEMA = constants.database.schema;

const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10);
const created: string[] = [];

/** Lo guardado en la base, sin pasar por ningún ORM. */
async function storedContact(personId: string) {
  const rows = await prisma.$queryRawUnsafe<{ email: string; email_hash: string; phone_primary: string | null; phone_primary_hash: string | null }[]>(
    `SELECT email, email_hash, phone_primary, phone_primary_hash FROM "${SCHEMA}".person_contacts WHERE person_id = $1::uuid`,
    personId
  );
  return rows[0]!;
}

describe('PII · Sequelize ↔ Prisma contra Postgres', () => {
  afterAll(async () => {
    if (created.length) await prisma.person.deleteMany({ where: { personId: { in: created } } });
    await prisma.$disconnect();
    await db.sequelize.close();
  });

  it('lo que cifra Sequelize lo descifra Prisma (también en include) y los hashes coinciden', async () => {
    const email = `seq-${uniq()}@test.cl`;
    const nationalId = uniq();
    const person = await db.Person.create({ first_name: 'Ana', last_name: 'Seq', national_id: nationalId });
    created.push(person.person_id);
    await db.PersonContact.create({ person_id: person.person_id, email, phone_primary: '+56911112222' });

    const stored = await storedContact(person.person_id);
    expect(stored.email).not.toBe(email); // en la base va cifrado
    expect(stored.email_hash).toBe(hashValue(email));

    const read = await prisma.person.findUnique({ where: { personId: person.person_id }, include: { contact: true } });
    expect(read?.nationalId).toBe(nationalId);
    expect(read?.nationalIdHash).toBe(hashValue(nationalId));
    expect(read?.contact?.email).toBe(email);
    expect(read?.contact?.phonePrimary).toBe('+56911112222');
  });

  it('lo que cifra Prisma (escritura anidada) lo descifra Sequelize, con los mismos hashes', async () => {
    const email = `prisma-${uniq()}@test.cl`;
    const nationalId = uniq();
    const person = await prisma.person.create({
      data: { firstName: 'Bea', lastName: 'Prisma', nationalId, contact: { create: { email, phonePrimary: '+56933334444' } } }
    });
    created.push(person.personId);

    // lo devuelto por create también sale descifrado
    expect(person.nationalId).toBe(nationalId);

    const stored = await storedContact(person.personId);
    expect(stored.email).not.toBe(email);
    expect(stored.email_hash).toBe(hashValue(email));
    expect(stored.phone_primary_hash).toBe(hashValue('+56933334444'));

    const seqPerson = await db.Person.findByPk(person.personId);
    const seqContact = await db.PersonContact.findOne({ where: { person_id: person.personId } });
    expect(seqPerson?.national_id).toBe(nationalId);
    expect(seqPerson?.national_id_hash).toBe(hashValue(nationalId));
    expect(seqContact?.email).toBe(email);
    expect(seqContact?.phone_primary).toBe('+56933334444');
  });

  it('se busca por hash (no por el valor cifrado) y filtrar por el campo cifrado es un error', async () => {
    const email = `hash-${uniq()}@test.cl`;
    const person = await prisma.person.create({ data: { firstName: 'Caro', lastName: 'Hash', contact: { create: { email } } } });
    created.push(person.personId);

    const found = await prisma.personContact.findFirst({ where: { emailHash: hashValue(email) } });
    expect(found?.email).toBe(email);
    await expect(prisma.personContact.findFirst({ where: { email } })).rejects.toThrow(/emailHash/);
  });

  it('al crear con Prisma dentro de una request estampa origin_session_id (como el mixin de Sequelize)', async () => {
    const sessionId = randomUUID();
    const person = await requestContext.run(
      { correlationId: 'corr-pii-test', ip: null, userAgent: null, fingerprintHash: null, method: null, path: null, source: 'http', sessionId },
      // await DENTRO del contexto: las consultas de Prisma son perezosas y corren al esperarlas
      // eslint-disable-next-line no-return-await -- el await tiene que correr DENTRO del contexto
      async () => await prisma.person.create({ data: { firstName: 'Dani', lastName: 'Origen' } })
    );
    created.push(person.personId);

    expect(person.originSessionId).toBe(sessionId);
    expect(person.originCorrelationId).toBe('corr-pii-test');
  });

  it('dentro de unitOfWork.run() el cliente de la transacción también cifra y descifra', async () => {
    const email = `uow-${uniq()}@test.cl`;
    const person = await unitOfWork.run(async () => {
      const tx = await txContext.activeUnit()!.prisma();
      return tx.person.create({ data: { firstName: 'Eva', lastName: 'Tx', contact: { create: { email } } }, include: { contact: true } });
    });
    created.push(person.personId);

    expect(person.contact?.email).toBe(email); // lo devuelto, descifrado
    const stored = await storedContact(person.personId);
    expect(stored.email).not.toBe(email); // en la base, cifrado
    expect(stored.email_hash).toBe(hashValue(email));
  });
});
