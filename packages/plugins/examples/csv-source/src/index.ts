/**
 * Example CSV Source Plugin for Agent Profiler.
 *
 * Demonstrates how to implement a SessionSourcePlugin that reads
 * session data from CSV files. This is a mock implementation for
 * illustration purposes.
 */

import type { Session } from '@agent-profiler/core';
import type { SessionDataSource, SessionListItem } from '@agent-profiler/data-source';
import type { PluginManifest, SessionSourcePlugin } from '@agent-profiler/plugins';

/**
 * Mock CSV data source that demonstrates the plugin contract.
 * In a real plugin, this would parse actual CSV files.
 */
class CsvDataSource implements SessionDataSource {
  constructor(private readonly csvPath: string) {}

  async listSessions(): Promise<SessionListItem[]> {
    // Mock implementation — a real plugin would read and parse the CSV file
    return [
      {
        id: 'csv-session-1',
        name: 'Sample CSV Session',
        path: this.csvPath,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        adapter: 'copilot-cli', // Would be a custom type in practice
      },
    ];
  }

  async getSession(_sessionId: string): Promise<Session | null> {
    // Mock implementation — return null to indicate not found
    return null;
  }

  async isAvailable(): Promise<boolean> {
    // In a real plugin, check if the CSV file exists and is readable
    return true;
  }
}

const csvSourcePlugin: SessionSourcePlugin = {
  metadata: {
    id: 'csv-source',
    name: 'CSV Session Source',
    version: '0.1.0',
    description: 'Reads session data from CSV files',
    author: 'Agent Profiler Team',
  },
  adapterType: 'csv',
  createDataSource(config: Record<string, unknown>): SessionDataSource {
    const csvPath = (config['path'] as string) ?? './sessions.csv';
    return new CsvDataSource(csvPath);
  },
};

/**
 * Plugin manifest — the main export that Agent Profiler discovers.
 */
const manifest: PluginManifest = {
  apiVersion: '1.0',
  plugins: [csvSourcePlugin],
};

export default manifest;
export { manifest };
