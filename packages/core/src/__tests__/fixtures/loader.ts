/**
 * Golden fixture loader.
 *
 * Loads and validates test fixtures against the Zod schemas to ensure
 * they remain in sync with the domain model.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sessionSchema } from '../../schemas/index';
import type { Session } from '../../types/index';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load the golden session fixture and validate it against the schema.
 *
 * @throws {ZodError} if the fixture does not conform to the schema.
 */
export function loadGoldenSession(): Session {
  const filePath = resolve(__dirname, 'golden-session.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
  return sessionSchema.parse(raw);
}
