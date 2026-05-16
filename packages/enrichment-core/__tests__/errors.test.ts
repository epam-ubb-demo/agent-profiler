import { describe, expect, it } from 'vitest';

import {
  DuplicateRegistrationError,
  NotFoundError,
  RetriableSinkError,
} from '../src/index.js';

describe('Error classes', () => {
  describe('DuplicateRegistrationError', () => {
    it('should create an error with correct name and message', () => {
      const error = new DuplicateRegistrationError('SourceRegistry', 'copilot-cli');
      expect(error.name).toBe('DuplicateRegistrationError');
      expect(error.message).toBe(
        'SourceRegistry with key "copilot-cli" is already registered',
      );
      expect(error).toBeInstanceOf(Error);
    });

    it('should work with different kinds and keys', () => {
      const error1 = new DuplicateRegistrationError('SinkRegistry', 'sink-1');
      expect(error1.message).toBe('SinkRegistry with key "sink-1" is already registered');

      const error2 = new DuplicateRegistrationError('ProjectorRegistry', 'vscode-chat');
      expect(error2.message).toBe(
        'ProjectorRegistry with key "vscode-chat" is already registered',
      );
    });

    it('should be catchable as Error', () => {
      const error = new DuplicateRegistrationError('Registry', 'key');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('NotFoundError', () => {
    it('should create an error with correct name and message', () => {
      const error = new NotFoundError('SourceRegistry', 'copilot-cli');
      expect(error.name).toBe('NotFoundError');
      expect(error.message).toBe(
        'SourceRegistry with key "copilot-cli" is not registered',
      );
      expect(error).toBeInstanceOf(Error);
    });

    it('should work with different kinds and keys', () => {
      const error1 = new NotFoundError('SinkRegistry', 'sink-1');
      expect(error1.message).toBe('SinkRegistry with key "sink-1" is not registered');

      const error2 = new NotFoundError('ProjectorRegistry', 'unknown-tool');
      expect(error2.message).toBe(
        'ProjectorRegistry with key "unknown-tool" is not registered',
      );
    });

    it('should be catchable as Error', () => {
      const error = new NotFoundError('Registry', 'key');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('RetriableSinkError', () => {
    it('should create an error with correct name and message', () => {
      const error = new RetriableSinkError('Sink temporarily unavailable');
      expect(error.name).toBe('RetriableSinkError');
      expect(error.message).toBe('Sink temporarily unavailable');
      expect(error).toBeInstanceOf(Error);
    });

    it('should store retryAfterMs when provided', () => {
      const error = new RetriableSinkError('Connection timeout', 5000);
      expect(error.retryAfterMs).toBe(5000);
    });

    it('should have undefined retryAfterMs when not provided', () => {
      const error = new RetriableSinkError('Connection error');
      expect(error.retryAfterMs).toBeUndefined();
    });

    it('should store retryAfterMs as 0', () => {
      const error = new RetriableSinkError('Rate limited', 0);
      expect(error.retryAfterMs).toBe(0);
    });

    it('should handle large retryAfterMs values', () => {
      const error = new RetriableSinkError('Maintenance', 3600000);
      expect(error.retryAfterMs).toBe(3600000);
    });

    it('should be catchable as Error', () => {
      const error = new RetriableSinkError('Error', 1000);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
