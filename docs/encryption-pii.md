# Encriptación y PII — guía de onboarding

> Detalle aquí.
> Utils: `shared/utils/encryption.util.js` (AES-256-GCM) y `shared/utils/hash.util.js` (HMAC para búsqueda).
>
> Este doc cubre cómo se **guarda** la PII. Cómo **sale** por la API (enmascaramiento en respuestas) está en
> [`pii-masking.md`](./pii-masking.md).

## Idea general

Los campos PII se guardan **cifrados** (AES-256-GCM) y, en paralelo, se guarda un **hash determinístico**
(`*_hash`, HMAC-SHA256) que permite buscar por igualdad sin descifrar. Los modelos descifran solos en
lectura (hook `afterFind`) y cifran + calculan el hash en escritura (`beforeCreate`/`beforeUpdate`).
Los `*_hash` son internos: **nunca** se exponen en DTOs.

## Campos cifrados

| Modelo               | Campo cifrado                                       | Hash gemelo          |
| -------------------- | --------------------------------------------------- | -------------------- |
| `Person`             | `national_id`                                       | `national_id_hash`   |
| `PersonContact`      | `email`, `phone_primary`, `phone_secondary`         | `*_hash` de cada uno |
| `UserTrustedDevice`  | `hmac_secret`                                       | —                    |

> `UserLoginAttempt.national_id_hash` es un caso de **solo hash**: guarda el HMAC para correlacionar intentos
> sin persistir nunca el documento.
>
> `HashUtil` lee `process.env.HASH_PEPPER` directamente (`shared/utils/hash.util.js`) — única excepción viva a
> la regla `no-process-env` fuera de `shared/constants/`.

## `EncryptionUtil` (`shared/utils/encryption.util.js`)

- `encrypt(data)` → `"${ivHex}:${authTagHex}:${ciphertextHex}"` (IV aleatorio de 12 bytes por operación;
  salida autocontenida). AES-256-GCM (AEAD, integridad verificada).
- `decrypt(data)` → detecta formato nuevo (GCM, 3 partes) o legado (CBC). Lanza si el authTag no valida.
- `safeDecrypt(value)` → descifra y, si falla, devuelve el valor original. **Úsalo en DTOs** para modelos
  anidados donde el `afterFind` pudo no dispararse (Sequelize 6 a veces no lo aplica en asociaciones).
- `generateHmac(data, secret)` → HMAC-SHA256 genérico. **La firma de requests mobile NO usa este**: usa
  `generateRequestHmac(timestamp, method, path, secret)` sobre `${timestamp}:${method}:${path}`, con ventana
  de 10 s (`shared/services/hmac.service.js`).
- Clave AES desde config (env). El `AES_IV` del env es solo compatibilidad legado (CBC); los cifrados
  nuevos usan IV aleatorio embebido.

## `HashUtil` (`shared/utils/hash.util.js`) — búsqueda determinística

- `hashForSearch(value)` → HMAC-SHA256 de `value.trim().toLowerCase()` con `HASH_PEPPER` (secreto en env /
  Secrets Manager, mín. 32 chars). Determinístico → sirve para cláusulas `WHERE *_hash = ...`. Devuelve
  `null` si el valor es vacío.
- Es la pieza que resuelve el problema de "no se puede buscar por un campo con IV aleatorio".

> ⚠️ El `*_hash` NO es un HMAC con la clave AES; es `HashUtil.hashForSearch` con `HASH_PEPPER`. Sin
> `HASH_PEPPER` configurado, el server no debe arrancar.

## Hooks en modelos (ejemplo `PersonContact`)

```js
hooks: {
  beforeCreate: c => { if (c.email) { c.email_hash = HashUtil.hashForSearch(c.email); c.email = EncryptionUtil.encrypt(c.email); } /* phones idem */ },
  beforeUpdate: c => { /* idem, solo si el campo cambió */ },
  afterFind: result => { /* descifra email/phone_* en cada registro (y anidados) */ }
}
```

- `Person.afterFind` además descifra el `contact` anidado si viene incluido (manejo defensivo Sequelize 6).
- Un modelo cuyo campo cifrado sea un **JSONB** (PII anidada) o que **no deba descifrar en cada lectura** puede
  saltarse los hooks y cifrar/descifrar explícito en su service/helper — decisión por modelo.

## Búsqueda por hash (repositorios)

```js
// person.repository.js
findByNationalId(nationalId) {
  return this.findOne({ national_id_hash: HashUtil.hashForSearch(nationalId) });
}
// person-contact.repository.js
findByEmail(email, options = {}) {
  return this.findOne({ email_hash: HashUtil.hashForSearch(email) }, options);
}
```

❌ Nunca `WHERE email = EncryptionUtil.encrypt(email)` (no determinístico, nunca haría match).
✅ Siempre buscar por el `*_hash`.

## Reglas

- ❌ Los `*_hash` nunca van en DTOs ni se envían al cliente — solo para `WHERE`.
- ✅ En DTOs, descifrar **siempre** con `EncryptionUtil.safeDecrypt(...)` — nunca confiar en el `afterFind`,
  que no corre en includes anidados — y **enmascarar el resultado** antes de exponerlo
  (`MaskingUtil.maskDocumentId/maskEmail/maskPhone`). Ver [`pii-masking.md`](./pii-masking.md).
- ✅ Para nuevos campos PII: columna cifrada + columna `*_hash`, hooks `beforeCreate/beforeUpdate/afterFind`
  (o helper explícito si es JSONB/anidado), método `findByX` en el repo usando `hashForSearch`, y **la key
  del campo declarada en `shared/constants/pii-fields.js`** para que quede enmascarado en las respuestas.
