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
    list: () => Promise<SessionListItemIpc[]>;
    /** Opens a session by ID, returning full session data or null */
    open: (sessionId: string) => Promise<unknown | null>;
    /** Sets the root directory for session scanning */
    setRootDir: (dir: string) => Promise<boolean>;
  };
}

export interface SessionListItemIpc {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  adapter: 'copilot-cli' | 'vscode-chat' | 'vscode-agent' | 'ctb';
}
