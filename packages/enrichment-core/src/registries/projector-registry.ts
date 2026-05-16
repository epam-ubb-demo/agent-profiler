import { DuplicateRegistrationError, NotFoundError } from '../errors.js';
import type { SessionProjector } from '../projector.js';
import type { ToolId } from '../tool-id.js';

/**
 * Registry of {@link SessionProjector} instances, keyed by {@link ToolId}.
 */
export class ProjectorRegistry {
  readonly #projectors = new Map<ToolId, SessionProjector>();

  /**
   * Register a projector.
   * @throws {DuplicateRegistrationError} if a projector for this tool is already registered.
   */
  register(projector: SessionProjector): void {
    if (this.#projectors.has(projector.tool)) {
      throw new DuplicateRegistrationError('ProjectorRegistry', projector.tool);
    }
    this.#projectors.set(projector.tool, projector);
  }

  /**
   * Retrieve the projector registered for the given tool.
   * @throws {NotFoundError} if no projector is registered for this tool.
   */
  forTool(tool: ToolId): SessionProjector {
    const projector = this.#projectors.get(tool);
    if (projector === undefined) {
      throw new NotFoundError('ProjectorRegistry', tool);
    }
    return projector;
  }

  /** Return all registered projectors in insertion order. */
  list(): readonly SessionProjector[] {
    return [...this.#projectors.values()];
  }
}
