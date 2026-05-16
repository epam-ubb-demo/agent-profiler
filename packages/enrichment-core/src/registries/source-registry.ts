import { DuplicateRegistrationError, NotFoundError } from '../errors.js';
import type { SessionEnrichmentSource } from '../source.js';
import type { ToolId } from '../tool-id.js';

/**
 * Registry of {@link SessionEnrichmentSource} instances, keyed by {@link ToolId}.
 */
export class SourceRegistry {
  readonly #sources = new Map<ToolId, SessionEnrichmentSource>();

  /**
   * Register a source.
   * @throws {DuplicateRegistrationError} if a source for this tool is already registered.
   */
  register(source: SessionEnrichmentSource): void {
    if (this.#sources.has(source.tool)) {
      throw new DuplicateRegistrationError('SourceRegistry', source.tool);
    }
    this.#sources.set(source.tool, source);
  }

  /**
   * Retrieve the source registered for the given tool.
   * @throws {NotFoundError} if no source is registered for this tool.
   */
  forTool(tool: ToolId): SessionEnrichmentSource {
    const source = this.#sources.get(tool);
    if (source === undefined) {
      throw new NotFoundError('SourceRegistry', tool);
    }
    return source;
  }

  /** Return all registered sources in insertion order. */
  list(): readonly SessionEnrichmentSource[] {
    return [...this.#sources.values()];
  }
}
