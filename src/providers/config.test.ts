/**
 * Configuration Tests
 *
 * Tests for configuration loading and parsing.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { parseDotEnv, ConfigError, loadConfig } from './config.js';

describe('parseDotEnv', () => {
  describe('basic parsing', () => {
    it('should parse KEY=VALUE pairs', () => {
      const content = 'KEY=value';

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { KEY: 'value' });
    });

    it('should parse multiple KEY=VALUE pairs', () => {
      const content = `
KEY1=value1
KEY2=value2
KEY3=value3
`.trim();

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, {
        KEY1: 'value1',
        KEY2: 'value2',
        KEY3: 'value3',
      });
    });

    it('should preserve case of keys and values', () => {
      const content = 'MyKey=MyValue';

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { MyKey: 'MyValue' });
    });
  });

  describe('comments', () => {
    it('should skip lines starting with #', () => {
      const content = `
# This is a comment
KEY=value
# Another comment
`.trim();

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { KEY: 'value' });
    });

    it('should handle comments with leading whitespace', () => {
      const content = `   # Comment with spaces
KEY=value`;

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { KEY: 'value' });
    });
  });

  describe('empty lines', () => {
    it('should skip empty lines', () => {
      const content = `
KEY1=value1

KEY2=value2

`;

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { KEY1: 'value1', KEY2: 'value2' });
    });

    it('should handle lines with only whitespace', () => {
      const content = `KEY1=value1
   
KEY2=value2`;

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { KEY1: 'value1', KEY2: 'value2' });
    });
  });

  describe('quoted values', () => {
    it('should handle double quoted values', () => {
      const content = 'KEY="hello world"';

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { KEY: 'hello world' });
    });

    it('should handle single quoted values', () => {
      const content = "KEY='hello world'";

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { KEY: 'hello world' });
    });

    it('should remove only outer quotes', () => {
      const content = 'KEY="value with \\"nested\\" quotes"';

      const result = parseDotEnv(content);

      // The outer quotes are removed, inner content preserved
      assert.strictEqual(result.KEY, 'value with \\"nested\\" quotes');
    });

    it('should not remove quotes if not matching', () => {
      const content = 'KEY="unmatched';

      const result = parseDotEnv(content);

      assert.strictEqual(result.KEY, '"unmatched');
    });
  });

  describe('values containing = characters', () => {
    it('should handle values with = sign', () => {
      const content = 'URL=https://example.com?param=value';

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { URL: 'https://example.com?param=value' });
    });

    it('should handle multiple = signs in value', () => {
      const content = 'EQUATION=a=b=c=d';

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { EQUATION: 'a=b=c=d' });
    });

    it('should handle base64 encoded values', () => {
      const content = 'SECRET=dGVzdA==';

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { SECRET: 'dGVzdA==' });
    });
  });

  describe('empty keys', () => {
    it('should skip lines with empty keys', () => {
      const content = `=value
KEY=actual`;

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { KEY: 'actual' });
    });

    it('should skip lines where key becomes empty after trim', () => {
      const content = `  =value
KEY=actual`;

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { KEY: 'actual' });
    });
  });

  describe('lines without =', () => {
    it('should skip lines without = character', () => {
      const content = `invalid line
KEY=value`;

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { KEY: 'value' });
    });

    it('should handle all invalid lines', () => {
      const content = `line1
line2
line3`;

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, {});
    });
  });

  describe('whitespace handling', () => {
    it('should trim keys', () => {
      const content = '  KEY  =value';

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { KEY: 'value' });
    });

    it('should trim values', () => {
      const content = 'KEY=  value  ';

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { KEY: 'value' });
    });

    it('should handle Windows line endings (CRLF)', () => {
      const content = 'KEY1=value1\r\nKEY2=value2';

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { KEY1: 'value1', KEY2: 'value2' });
    });
  });

  describe('empty content', () => {
    it('should return empty object for empty string', () => {
      const result = parseDotEnv('');

      assert.deepStrictEqual(result, {});
    });

    it('should return empty object for only whitespace/comments', () => {
      const content = `
# Only comments
   
# More comments
`;

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, {});
    });
  });

  describe('empty values', () => {
    it('should allow empty values', () => {
      const content = 'KEY=';

      const result = parseDotEnv(content);

      assert.deepStrictEqual(result, { KEY: '' });
    });
  });
});

describe('ConfigError', () => {
  describe('constructor', () => {
    it('should create message with field list', () => {
      const error = new ConfigError(['FIELD1', 'FIELD2']);

      assert.ok(error.message.includes('FIELD1'));
      assert.ok(error.message.includes('FIELD2'));
    });

    it('should include "Missing required configuration" in message', () => {
      const error = new ConfigError(['MY_FIELD']);

      assert.ok(error.message.includes('Missing required configuration'));
    });

    it('should set missingFields property correctly', () => {
      const fields = ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_DEPLOYMENT'];
      const error = new ConfigError(fields);

      assert.deepStrictEqual(error.missingFields, fields);
    });

    it('should set name to "ConfigError"', () => {
      const error = new ConfigError(['FIELD']);

      assert.strictEqual(error.name, 'ConfigError');
    });

    it('should inherit from Error', () => {
      const error = new ConfigError(['FIELD']);

      assert.ok(error instanceof Error);
      assert.ok(error instanceof ConfigError);
    });

    it('should have a stack trace', () => {
      const error = new ConfigError(['FIELD']);

      assert.ok(typeof error.stack === 'string');
      assert.ok(error.stack.length > 0);
    });

    it('should handle single field', () => {
      const error = new ConfigError(['SINGLE_FIELD']);

      assert.strictEqual(error.missingFields.length, 1);
      assert.strictEqual(error.missingFields[0], 'SINGLE_FIELD');
    });

    it('should handle multiple fields', () => {
      const fields = ['FIELD1', 'FIELD2', 'FIELD3'];
      const error = new ConfigError(fields);

      assert.strictEqual(error.missingFields.length, 3);
    });

    it('should include Entra ID hint in message', () => {
      const error = new ConfigError(['FIELD']);

      assert.ok(
        error.message.includes('Entra ID') || error.message.includes('az login'),
        'Should mention Entra ID or az login'
      );
    });
  });
});

describe('loadConfig', () => {
  // Store original env vars
  const originalEnv: Record<string, string | undefined> = {};
  const envKeys = [
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_DEPLOYMENT',
    'AZURE_OPENAI_API_VERSION',
  ];

  beforeEach(() => {
    // Save original values
    for (const key of envKeys) {
      originalEnv[key] = process.env[key];
    }
    // Clear all env vars for clean test state
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original values
    for (const key of envKeys) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  // Mock credential that satisfies TokenCredential interface
  const mockCredential = {
    getToken: async () => ({ token: 'mock-token', expiresOnTimestamp: Date.now() + 3600000 }),
  };

  describe('successful configuration', () => {
    it('should return config when all required env vars are set', () => {
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4';

      const config = loadConfig(mockCredential);

      assert.strictEqual(config.endpoint, 'https://test.openai.azure.com');
      assert.strictEqual(config.deployment, 'gpt-4');
    });

    it('should use default API version when not specified', () => {
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4';

      const config = loadConfig(mockCredential);

      assert.strictEqual(config.apiVersion, '2024-12-01-preview');
    });

    it('should use custom API version when AZURE_OPENAI_API_VERSION is set', () => {
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4';
      process.env.AZURE_OPENAI_API_VERSION = '2025-01-01';

      const config = loadConfig(mockCredential);

      assert.strictEqual(config.apiVersion, '2025-01-01');
    });

    it('should accept custom TokenCredential', () => {
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4';

      const customCredential = {
        getToken: async () => ({ token: 'custom-token', expiresOnTimestamp: Date.now() + 1000 }),
      };

      const config = loadConfig(customCredential);

      assert.strictEqual(config.credential, customCredential);
    });

    it('should include credential in returned config', () => {
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4';

      const config = loadConfig(mockCredential);

      assert.ok(config.credential);
      assert.strictEqual(config.credential, mockCredential);
    });
  });

  describe('missing required fields', () => {
    it('should throw ConfigError when AZURE_OPENAI_ENDPOINT is missing', () => {
      process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4';
      // AZURE_OPENAI_ENDPOINT not set

      assert.throws(
        () => loadConfig(mockCredential),
        (error: unknown) => {
          assert.ok(error instanceof ConfigError);
          assert.ok(error.missingFields.includes('AZURE_OPENAI_ENDPOINT'));
          return true;
        }
      );
    });

    it('should throw ConfigError when AZURE_OPENAI_DEPLOYMENT is missing', () => {
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      // AZURE_OPENAI_DEPLOYMENT not set

      assert.throws(
        () => loadConfig(mockCredential),
        (error: unknown) => {
          assert.ok(error instanceof ConfigError);
          assert.ok(error.missingFields.includes('AZURE_OPENAI_DEPLOYMENT'));
          return true;
        }
      );
    });

    it('should throw ConfigError with both fields when both are missing', () => {
      // Neither env var set

      assert.throws(
        () => loadConfig(mockCredential),
        (error: unknown) => {
          assert.ok(error instanceof ConfigError);
          assert.ok(error.missingFields.includes('AZURE_OPENAI_ENDPOINT'));
          assert.ok(error.missingFields.includes('AZURE_OPENAI_DEPLOYMENT'));
          assert.strictEqual(error.missingFields.length, 2);
          return true;
        }
      );
    });
  });

  describe('invalid URL format', () => {
    it('should throw ConfigError when endpoint is invalid URL', () => {
      process.env.AZURE_OPENAI_ENDPOINT = 'not-a-valid-url';
      process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4';

      assert.throws(
        () => loadConfig(mockCredential),
        (error: unknown) => {
          assert.ok(error instanceof ConfigError);
          assert.ok(
            error.missingFields.some((f: string) => f.includes('invalid URL')),
            `Expected invalid URL error, got: ${error.missingFields}`
          );
          return true;
        }
      );
    });

    it('should throw ConfigError when endpoint is empty', () => {
      process.env.AZURE_OPENAI_ENDPOINT = '';
      process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4';

      assert.throws(
        () => loadConfig(mockCredential),
        (error: unknown) => {
          assert.ok(error instanceof ConfigError);
          return true;
        }
      );
    });

    it('should accept valid HTTP URL', () => {
      process.env.AZURE_OPENAI_ENDPOINT = 'http://localhost:8080';
      process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4';

      const config = loadConfig(mockCredential);

      assert.strictEqual(config.endpoint, 'http://localhost:8080');
    });

    it('should accept valid HTTPS URL', () => {
      process.env.AZURE_OPENAI_ENDPOINT = 'https://my-resource.openai.azure.com';
      process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4';

      const config = loadConfig(mockCredential);

      assert.strictEqual(config.endpoint, 'https://my-resource.openai.azure.com');
    });
  });

  describe('credential handling', () => {
    it('should use provided credential instead of DefaultAzureCredential', () => {
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
      process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4';

      const config = loadConfig(mockCredential);

      assert.strictEqual(config.credential, mockCredential);
    });

    // Note: We don't test DefaultAzureCredential creation here as it would require
    // actual Azure auth infrastructure. The function creates it when no credential
    // is provided, but testing that path would need integration tests.
  });
});
