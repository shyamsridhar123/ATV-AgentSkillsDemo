/**
 * Retry Utility Tests
 *
 * Tests for exponential backoff retry logic.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { calculateDelay, isTransientError, retry, RetryError } from './retry.js';

describe('RetryError', () => {
  describe('constructor', () => {
    it('should set message correctly', () => {
      const lastError = new Error('Last error');
      const error = new RetryError('All attempts failed', 3, lastError);

      assert.strictEqual(error.message, 'All attempts failed');
    });

    it('should set attempts correctly', () => {
      const lastError = new Error('Last error');
      const error = new RetryError('Failed', 5, lastError);

      assert.strictEqual(error.attempts, 5);
    });

    it('should set lastError correctly', () => {
      const lastError = new Error('Original failure');
      const error = new RetryError('Failed', 3, lastError);

      assert.strictEqual(error.lastError, lastError);
      assert.strictEqual(error.lastError.message, 'Original failure');
    });

    it('should set name to "RetryError"', () => {
      const lastError = new Error('Test');
      const error = new RetryError('Failed', 1, lastError);

      assert.strictEqual(error.name, 'RetryError');
    });

    it('should inherit from Error', () => {
      const lastError = new Error('Test');
      const error = new RetryError('Failed', 1, lastError);

      assert.ok(error instanceof Error);
      assert.ok(error instanceof RetryError);
    });

    it('should have a stack trace', () => {
      const lastError = new Error('Test');
      const error = new RetryError('Failed', 1, lastError);

      assert.ok(typeof error.stack === 'string');
      assert.ok(error.stack.length > 0);
    });
  });
});

describe('calculateDelay', () => {
  describe('without jitter', () => {
    it('should return baseDelay for attempt 0', () => {
      const delay = calculateDelay(0, 1000, 30000, false);

      assert.strictEqual(delay, 1000);
    });

    it('should return 2*baseDelay for attempt 1 (exponential backoff)', () => {
      const delay = calculateDelay(1, 1000, 30000, false);

      assert.strictEqual(delay, 2000);
    });

    it('should return 4*baseDelay for attempt 2', () => {
      const delay = calculateDelay(2, 1000, 30000, false);

      assert.strictEqual(delay, 4000);
    });

    it('should return 8*baseDelay for attempt 3', () => {
      const delay = calculateDelay(3, 1000, 30000, false);

      assert.strictEqual(delay, 8000);
    });

    it('should follow formula baseDelay * 2^attempt', () => {
      const baseDelay = 500;
      const maxDelay = 100000;

      for (let attempt = 0; attempt < 5; attempt++) {
        const expected = baseDelay * Math.pow(2, attempt);
        const actual = calculateDelay(attempt, baseDelay, maxDelay, false);
        assert.strictEqual(actual, expected, `attempt ${attempt} should be ${expected}`);
      }
    });

    it('should cap at maxDelay', () => {
      const delay = calculateDelay(10, 1000, 5000, false);

      assert.strictEqual(delay, 5000);
    });

    it('should cap when exponential exceeds maxDelay', () => {
      // attempt 4 with base 1000 = 16000, but maxDelay is 10000
      const delay = calculateDelay(4, 1000, 10000, false);

      assert.strictEqual(delay, 10000);
    });

    it('should work with small baseDelay', () => {
      const delay = calculateDelay(0, 1, 100, false);

      assert.strictEqual(delay, 1);
    });
  });

  describe('with jitter', () => {
    it('should return value in expected range (0.5x to 1.5x) for attempt 0', () => {
      const baseDelay = 1000;
      const lowerBound = baseDelay * 0.5;
      const upperBound = baseDelay * 1.5;

      // Run multiple times to test jitter variance
      for (let i = 0; i < 10; i++) {
        const delay = calculateDelay(0, baseDelay, 30000, true);
        assert.ok(delay >= lowerBound - 1, `delay ${delay} should be >= ${lowerBound}`);
        assert.ok(delay <= upperBound + 1, `delay ${delay} should be <= ${upperBound}`);
      }
    });

    it('should return varying values due to randomness', () => {
      const delays = new Set<number>();

      // Generate many delays; with jitter they should vary
      for (let i = 0; i < 50; i++) {
        const delay = calculateDelay(0, 1000, 30000, true);
        delays.add(delay);
      }

      // With 50 samples and jitter, we should have multiple unique values
      assert.ok(delays.size > 1, 'Jitter should produce varying delays');
    });

    it('should respect maxDelay cap even with jitter', () => {
      const maxDelay = 1000;

      for (let i = 0; i < 10; i++) {
        const delay = calculateDelay(5, 1000, maxDelay, true);
        assert.ok(delay <= maxDelay * 1.5 + 1, `delay should not greatly exceed maxDelay * 1.5`);
      }
    });

    it('should return integers (floor applied)', () => {
      for (let i = 0; i < 10; i++) {
        const delay = calculateDelay(0, 1000, 30000, true);
        assert.strictEqual(Math.floor(delay), delay, 'delay should be an integer');
      }
    });
  });
});

describe('isTransientError', () => {
  describe('HTTP status codes', () => {
    describe('retryable status codes', () => {
      const retryableStatuses = [429, 500, 502, 503, 504];

      for (const status of retryableStatuses) {
        it(`should return true for HTTP ${status}`, () => {
          const error = new Error('Test error') as Error & { status: number };
          error.status = status;

          const result = isTransientError(error);

          assert.strictEqual(result, true);
        });

        it(`should return true for HTTP ${status} using statusCode property`, () => {
          const error = new Error('Test error') as Error & { statusCode: number };
          error.statusCode = status;

          const result = isTransientError(error);

          assert.strictEqual(result, true);
        });
      }
    });

    describe('non-retryable status codes', () => {
      const nonRetryableStatuses = [400, 401, 403, 404, 405, 422];

      for (const status of nonRetryableStatuses) {
        it(`should return false for HTTP ${status}`, () => {
          const error = new Error('Test error') as Error & { status: number };
          error.status = status;

          const result = isTransientError(error);

          assert.strictEqual(result, false);
        });
      }
    });
  });

  describe('network error codes', () => {
    const transientNetworkCodes = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ENETUNREACH',
      'EHOSTUNREACH',
      'EPIPE',
      'EAI_AGAIN',
    ];

    for (const code of transientNetworkCodes) {
      it(`should return true for ${code}`, () => {
        const error = new Error('Network error') as Error & { code: string };
        error.code = code;

        const result = isTransientError(error);

        assert.strictEqual(result, true, `${code} should be transient`);
      });
    }

    it('should return false for unknown error code', () => {
      const error = new Error('Unknown error') as Error & { code: string };
      error.code = 'UNKNOWN_CODE';

      const result = isTransientError(error);

      assert.strictEqual(result, false);
    });
  });

  describe('errors without status or code', () => {
    it('should return false for plain Error', () => {
      const error = new Error('Plain error');

      const result = isTransientError(error);

      assert.strictEqual(result, false);
    });

    it('should return false for error with only message', () => {
      const error = new Error('Something went wrong');

      const result = isTransientError(error);

      assert.strictEqual(result, false);
    });
  });

  describe('custom retryableStatuses', () => {
    it('should use custom retryable statuses', () => {
      const error = new Error('Test') as Error & { status: number };
      error.status = 418; // I'm a teapot

      // With default, 418 is not retryable
      assert.strictEqual(isTransientError(error), false);

      // With custom statuses including 418
      assert.strictEqual(isTransientError(error, [418]), true);
    });

    it('should not treat default retryable status as retryable if excluded from custom list', () => {
      const error = new Error('Test') as Error & { status: number };
      error.status = 429;

      // With custom statuses not including 429
      assert.strictEqual(isTransientError(error, [500]), false);
    });

    it('should still check network codes even with custom statuses', () => {
      const error = new Error('Network error') as Error & { code: string };
      error.code = 'ECONNRESET';

      // Network error codes are checked independently of HTTP statuses
      assert.strictEqual(isTransientError(error, [400]), true);
    });
  });
});

describe('retry', () => {
  describe('successful execution', () => {
    it('should return result on first success', async () => {
      const fn = mock.fn(async () => 'success');

      const result = await retry(fn, { baseDelay: 1, jitter: false });

      assert.strictEqual(result, 'success');
      assert.strictEqual(fn.mock.calls.length, 1);
    });

    it('should return the value from async function', async () => {
      const fn = mock.fn(async () => ({ data: [1, 2, 3] }));

      const result = await retry(fn, { baseDelay: 1 });

      assert.deepStrictEqual(result, { data: [1, 2, 3] });
    });
  });

  describe('retry on transient error', () => {
    it('should retry and eventually succeed', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Server error') as Error & { status: number };
          error.status = 500;
          throw error;
        }
        return 'success after retry';
      };

      const result = await retry(fn, { baseDelay: 1, jitter: false });

      assert.strictEqual(result, 'success after retry');
      assert.strictEqual(attempts, 3);
    });

    it('should retry on rate limit error', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts === 1) {
          const error = new Error('Rate limited') as Error & { status: number };
          error.status = 429;
          throw error;
        }
        return 'success';
      };

      const result = await retry(fn, { baseDelay: 1, jitter: false });

      assert.strictEqual(result, 'success');
      assert.strictEqual(attempts, 2);
    });

    it('should retry on network error', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts === 1) {
          const error = new Error('Connection reset') as Error & { code: string };
          error.code = 'ECONNRESET';
          throw error;
        }
        return 'connected';
      };

      const result = await retry(fn, { baseDelay: 1, jitter: false });

      assert.strictEqual(result, 'connected');
      assert.strictEqual(attempts, 2);
    });
  });

  describe('exhausted retries', () => {
    it('should throw RetryError after exhausting maxRetries', async () => {
      const fn = async () => {
        const error = new Error('Always fails') as Error & { status: number };
        error.status = 503;
        throw error;
      };

      await assert.rejects(
        retry(fn, { maxRetries: 2, baseDelay: 1, jitter: false }),
        (error: unknown) => {
          assert.ok(error instanceof RetryError);
          assert.strictEqual(error.attempts, 3); // 1 initial + 2 retries
          assert.strictEqual(error.lastError.message, 'Always fails');
          return true;
        }
      );
    });

    it('should include total attempts in error message', async () => {
      const fn = async () => {
        const error = new Error('Fail') as Error & { status: number };
        error.status = 500;
        throw error;
      };

      await assert.rejects(
        retry(fn, { maxRetries: 3, baseDelay: 1, jitter: false }),
        (error: unknown) => {
          assert.ok(error instanceof RetryError);
          assert.ok(error.message.includes('4'), 'Should mention 4 total attempts');
          return true;
        }
      );
    });
  });

  describe('non-transient error', () => {
    it('should throw immediately without retry for 400 error', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        const error = new Error('Bad request') as Error & { status: number };
        error.status = 400;
        throw error;
      };

      await assert.rejects(retry(fn, { maxRetries: 3, baseDelay: 1 }), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.strictEqual((error as Error).message, 'Bad request');
        assert.ok(!(error instanceof RetryError), 'Should not be RetryError');
        return true;
      });

      assert.strictEqual(attempts, 1, 'Should only attempt once');
    });

    it('should throw immediately without retry for 401 error', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        const error = new Error('Unauthorized') as Error & { status: number };
        error.status = 401;
        throw error;
      };

      await assert.rejects(retry(fn, { maxRetries: 3, baseDelay: 1 }), (error: unknown) => {
        assert.ok(error instanceof Error);
        return true;
      });

      assert.strictEqual(attempts, 1);
    });

    it('should throw immediately for 403 error', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        const error = new Error('Forbidden') as Error & { status: number };
        error.status = 403;
        throw error;
      };

      await assert.rejects(retry(fn, { maxRetries: 3, baseDelay: 1 }));
      assert.strictEqual(attempts, 1);
    });

    it('should throw immediately for plain error without status', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        throw new Error('Unknown error');
      };

      await assert.rejects(retry(fn, { maxRetries: 3, baseDelay: 1 }));
      assert.strictEqual(attempts, 1);
    });
  });

  describe('onRetry callback', () => {
    it('should call onRetry with correct arguments', async () => {
      const onRetryCalls: { error: Error; attempt: number; delay: number }[] = [];
      let attempts = 0;

      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Server error') as Error & { status: number };
          error.status = 500;
          throw error;
        }
        return 'done';
      };

      await retry(fn, {
        baseDelay: 1,
        jitter: false,
        onRetry: (error, attempt, delay) => {
          onRetryCalls.push({ error, attempt, delay });
        },
      });

      assert.strictEqual(onRetryCalls.length, 2);

      // First retry
      assert.strictEqual(onRetryCalls[0].attempt, 1);
      assert.strictEqual(onRetryCalls[0].delay, 1); // baseDelay * 2^0

      // Second retry
      assert.strictEqual(onRetryCalls[1].attempt, 2);
      assert.strictEqual(onRetryCalls[1].delay, 2); // baseDelay * 2^1
    });

    it('should not call onRetry on successful first attempt', async () => {
      const onRetry = mock.fn();
      const fn = async () => 'success';

      await retry(fn, { baseDelay: 1, onRetry });

      assert.strictEqual(onRetry.mock.calls.length, 0);
    });
  });

  describe('maxRetries = 0', () => {
    it('should only attempt once with maxRetries=0', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        const error = new Error('Fail') as Error & { status: number };
        error.status = 500;
        throw error;
      };

      await assert.rejects(
        retry(fn, { maxRetries: 0, baseDelay: 1 }),
        (error: unknown) => {
          assert.ok(error instanceof RetryError);
          assert.strictEqual(error.attempts, 1);
          return true;
        }
      );

      assert.strictEqual(attempts, 1);
    });

    it('should succeed with maxRetries=0 if first attempt succeeds', async () => {
      const fn = async () => 'immediate success';

      const result = await retry(fn, { maxRetries: 0, baseDelay: 1 });

      assert.strictEqual(result, 'immediate success');
    });
  });

  describe('options defaults', () => {
    it('should work with empty options object', async () => {
      const fn = async () => 'result';

      // Uses default options
      const result = await retry(fn, {});

      assert.strictEqual(result, 'result');
    });

    it('should work with no options', async () => {
      const fn = async () => 'result';

      const result = await retry(fn);

      assert.strictEqual(result, 'result');
    });
  });

  describe('error conversion', () => {
    it('should convert non-Error throws to Error', async () => {
      const fn = async () => {
        throw 'string error'; // eslint-disable-line @typescript-eslint/only-throw-error
      };

      await assert.rejects(retry(fn, { maxRetries: 0, baseDelay: 1 }), (error: unknown) => {
        assert.ok(error instanceof RetryError);
        assert.ok(error.lastError instanceof Error);
        return true;
      });
    });
  });
});
