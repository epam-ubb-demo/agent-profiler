/** Thrown when attempting to register a source/sink/projector whose key is already taken. */
export class DuplicateRegistrationError extends Error {
  constructor(kind: string, key: string) {
    super(`${kind} with key "${key}" is already registered`);
    this.name = 'DuplicateRegistrationError';
  }
}

/** Thrown when looking up a source/sink/projector that has not been registered. */
export class NotFoundError extends Error {
  constructor(kind: string, key: string) {
    super(`${kind} with key "${key}" is not registered`);
    this.name = 'NotFoundError';
  }
}
