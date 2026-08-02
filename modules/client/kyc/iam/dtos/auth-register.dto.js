const { UserComponent, PersonComponent, PersonContactComponent } = require('../../../../../shared/dtos/kyc');

/**
 * ============================================================
 * AUTH REGISTER DTOs
 * ============================================================
 * Usa los componentes del shared — nunca duplicar lógica de mapeo aquí.
 *
 * Aliases esperados en user para RegisterResponseDTO:
 *   user.role      (Role)
 *   user.person    (Person)
 *   person.contact (PersonContact)
 *   person.gender  (Gender)
 */

function RegisterResponseDTO({ user, person, personContact, tokens }) {
  const dto = {
    user: UserComponent.build(user, { includeRole: true }),
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn
    }
  };

  // Self-view: el cliente ve SU propia data tras registrarse → unmask (sin enmascarar).
  if (person) {
    dto.person = PersonComponent.build(person, { includeGender: true, unmask: true });
  }

  if (personContact) {
    dto.contact = PersonContactComponent.build(personContact, { unmask: true });
  }

  return dto;
}

module.exports = {
  RegisterResponseDTO
};
