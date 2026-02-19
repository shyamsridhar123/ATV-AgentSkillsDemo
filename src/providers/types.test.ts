/**
 * LLM Provider Types Tests
 *
 * Tests for LLMError class and type definitions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { LLMError } from './types.js';
import type { LLMErrorCode } from './types.js';

describe('LLMError', () => {
  describe('constructor', () => {
    it('should set message correctly', () => {
      const error = new LLMError('Test message', 'AUTH_FAILED', 'test-provider');

      assert.strictEqual(error.message, 'Test message');
    });

    it('should set code correctly', () => {
      const error = new LLMError('Test', 'RATE_LIMITED', 'test-provider');

      assert.strictEqual(error.code, 'RATE_LIMITED');
    });

    it('should set provider correctly', () => {
      const error = new LLMError('Test', 'TIMEOUT', 'azure-openai');

      assert.strictEqual(error.provider, 'azure-openai');
    });

    it('should set statusCode from options', () => {
      const error = new LLMError('Test', 'SERVER_ERROR', 'test-provider', {
        statusCode: 503,
      });

      assert.strictEqual(error.statusCode, 503);
    });

    it('should leave statusCode undefined when not provided', () => {
      const error = new LLMError('Test', 'SERVER_ERROR', 'test-provider');

      assert.strictEqual(error.statusCode, undefined);
    });

    it('should set cause from options', () => {
      const originalError = new Error('Original error');
      const error = new LLMError('Wrapped', 'NETWORK_ERROR', 'test-provider', {
        cause: originalError,
      });

      assert.strictEqual(error.cause, originalError);
    });

    it('should leave cause undefined when not provided', () => {
      const error = new LLMError('Test', 'AUTH_FAILED', 'test-provider');

      assert.strictEqual(error.cause, undefined);
    });

    it('should set all options together', () => {
      const cause = new Error('Root cause');
      const error = new LLMError('Complete error', 'RATE_LIMITED', 'azure-openai', {
        statusCode: 429,
        retryable: true,
        cause,
      });

      assert.strictEqual(error.message, 'Complete error');
      assert.strictEqual(error.code, 'RATE_LIMITED');
      assert.strictEqual(error.provider, 'azure-openai');
      assert.strictEqual(error.statusCode, 429);
      assert.strictEqual(error.retryable, true);
      assert.strictEqual(error.cause, cause);
    });
  });

  describe('name property', () => {
    it('should be "LLMError"', () => {
      const error = new LLMError('Test', 'AUTH_FAILED', 'test');

      assert.strictEqual(error.name, 'LLMError');
    });
  });

  describe('inheritance', () => {
    it('should be an instance of Error', () => {
      const error = new LLMError('Test', 'AUTH_FAILED', 'test');

      assert.ok(error instanceof Error);
    });

    it('should be an instance of LLMError', () => {
      const error = new LLMError('Test', 'AUTH_FAILED', 'test');

      assert.ok(error instanceof LLMError);
    });

    it('should have a stack trace', () => {
      const error = new LLMError('Test', 'AUTH_FAILED', 'test');

      assert.ok(typeof error.stack === 'string');
      assert.ok(error.stack.length > 0);
    });
  });

  describe('isRetryableByDefault', () => {
    describe('retryable error codes', () => {
      const retryableErrorCodes: LLMErrorCode[] = [
        'RATE_LIMITED',
        'TIMEOUT',
        'SERVER_ERROR',
        'NETWORK_ERROR',
      ];

      for (const code of retryableErrorCodes) {
        it(`should default retryable to true for ${code}`, () => {
          const error = new LLMError('Test', code, 'test-provider');

          assert.strictEqual(error.retryable, true, `${code} should be retryable by default`);
        });
      }
    });

    describe('non-retryable error codes', () => {
      const nonRetryableErrorCodes: LLMErrorCode[] = ['AUTH_FAILED', 'INVALID_REQUEST'];

      for (const code of nonRetryableErrorCodes) {
        it(`should default retryable to false for ${code}`, () => {
          const error = new LLMError('Test', code, 'test-provider');

          assert.strictEqual(error.retryable, false, `${code} should not be retryable by default`);
        });
      }
    });
  });

  describe('custom retryable override', () => {
    it('should allow overriding retryable to false for a normally-retryable code', () => {
      const error = new LLMError('Test', 'RATE_LIMITED', 'test-provider', {
        retryable: false,
      });

      assert.strictEqual(error.retryable, false);
    });

    it('should allow overriding retryable to true for a normally-non-retryable code', () => {
      const error = new LLMError('Test', 'AUTH_FAILED', 'test-provider', {
        retryable: true,
      });

      assert.strictEqual(error.retryable, true);
    });

    it('should respect explicit retryable false even for SERVER_ERROR', () => {
      const error = new LLMError('Test', 'SERVER_ERROR', 'test-provider', {
        retryable: false,
      });

      assert.strictEqual(error.retryable, false);
    });
  });

  describe('readonly properties', () => {
    it('should have readonly code', () => {
      const error = new LLMError('Test', 'AUTH_FAILED', 'test');

      // TypeScript enforces this at compile time, but we verify the value is set correctly
      assert.strictEqual(error.code, 'AUTH_FAILED');
    });

    it('should have readonly provider', () => {
      const error = new LLMError('Test', 'AUTH_FAILED', 'test-provider');

      assert.strictEqual(error.provider, 'test-provider');
    });

    it('should have readonly retryable', () => {
      const error = new LLMError('Test', 'AUTH_FAILED', 'test');

      assert.strictEqual(error.retryable, false);
    });
  });
});
