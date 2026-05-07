/**
 * Typed API exposed to the renderer process via contextBridge.
 *
 * This interface defines the contract between the preload script
 * and the renderer. Zod schemas in @agent-profiler/core validate
 * the data flowing across this boundary at runtime.
 */
export interface ElectronApi {
  /** Returns the application version from package.json */
  getVersion: () => Promise<string>;

  session: {
    /** Lists all available session summaries */
    list: () => Promise<SessionSummary[]>;
    /** Opens a session by ID, returning full session data or null */
    open: (sessionId: string) => Promise<SessionData | null>;
  };
}

export interface SessionSummary {
  id: string;
  name: string;
  createdAt: string;
}

export interface SessionData {
  id: string;
  name: string;
  createdAt: string;
  events: unknown[];
}
