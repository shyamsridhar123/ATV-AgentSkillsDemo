# Security Policy

## Reporting a Vulnerability

**DO NOT** open a public GitHub issue for security vulnerabilities.

Please report security vulnerabilities by emailing the maintainers directly or using GitHub's private vulnerability reporting feature.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Initial response**: Within 48 hours
- **Triage and assessment**: Within 5 business days
- **Fix deployment**: Within 14 days for critical issues

## Scope

The following are in scope for security reports:

| In Scope | Out of Scope |
|----------|--------------|
| CLI code in `/bin` | Third-party MCP servers |
| Template files in `/templates` | User-modified agent files |
| Package distribution integrity | GitHub Copilot vulnerabilities |
| Documentation accuracy for security guidance | VS Code extension issues |

## Security Considerations

### Supply Chain

- This package has **zero runtime dependencies** to minimize attack surface
- Always verify you're installing from the official npm registry
- Check `package-lock.json` is present and matches expected checksums

### Agent Files

The `.agent.md` files contain instructions that influence AI behavior. Users should:

1. Review agent definitions before use in sensitive environments
2. Understand that agents have access to tools defined in their frontmatter
3. Be aware that `runSubagent` allows autonomous agent execution

### MCP Servers

If using optional MCP servers:

1. Only enable servers from trusted sources
2. Pin versions in your `mcp.json` configuration
3. Review what permissions each server requires
4. MCP servers can execute code—treat them as you would any executable

### File Operations

The CLI performs file operations (copying templates). It:

- Only writes to the current working directory
- Does not execute any copied files
- Uses Node.js built-in `fs` functions with no shell execution

### Shell Execution (`shell:true` in spawn)

The CLI uses `child_process.spawn()` with `shell:true` in specific cases. This section documents why, the mitigations in place, and how contributors should handle similar cases.

#### Why shell:true is Used

| Location | Reason | Risk Level |
| -------- | ------ | ---------- |
| `installBacklogCli()` | Cross-platform npm execution (npm.cmd on Windows) | None |
| `installBeads()` | Cross-platform npm execution (npm.cmd on Windows) | None |
| `initializeBeads()` | Consistency + shell script wrapper support | Low |

#### Security Mitigations

1. **No user input in commands**: All arguments are hardcoded constants. No user-supplied values are passed to the shell.

2. **Path validation**: For `initializeBeads()`, the executable path comes from `getBeadsPath()` which:
   - First checks if the binary responds to `--version`
   - Falls back to a hardcoded list of known paths, verified via `existsSync()`

3. **Input sanitization**: CLI arguments are validated before processing:

   ```javascript
   // Prevent command injection via malformed args
   if (arg.length > MAX_ARG_LENGTH) { /* reject */ }
   if (!/^[a-zA-Z0-9-]+$/.test(arg)) { /* reject */ }
   ```

4. **Allowlist pattern**: Only known commands and flags are accepted:

   ```javascript
   const ALLOWED_COMMANDS = ['init', 'help', '--help', '-h'];
   const ALLOWED_FLAGS = ['--force', '--skip-backlog', '--skip-mcp', '--skip-beads', '--verbose'];
   ```

#### Guidelines for Contributors

When adding new shell execution:

1. **Prefer `shell:false`** - Use it unless cross-platform execution requires otherwise
2. **Never interpolate user input** - If user input must be used, sanitize with allowlists
3. **Document rationale** - Add JSDoc comments explaining why shell:true is necessary
4. **Validate paths** - Use `existsSync()` before executing discovered binaries
5. **Hardcode arguments** - Prefer `['arg1', 'arg2']` over string concatenation

#### Example: Safe vs Unsafe Patterns

```javascript
// ✅ SAFE: Hardcoded command and arguments
spawn('npm', ['install', '-g', 'package-name'], { shell: true });

// ✅ SAFE: Validated path, hardcoded argument
const bdPath = getBeadsPath(); // Returns validated path or null
if (bdPath) spawn(bdPath, ['init'], { shell: true });

// ❌ UNSAFE: User input in command
spawn('npm', ['install', userInput], { shell: true }); // NEVER DO THIS

// ❌ UNSAFE: Unvalidated path
spawn(userProvidedPath, ['arg'], { shell: true }); // NEVER DO THIS
```

## Automated Security Tooling

This repository uses automated security scanning:

### Dependabot (`.github/dependabot.yml`)

- **Security alerts**: Automatic notifications for vulnerable dependencies
- **Version updates**: Weekly PRs for outdated npm packages and GitHub Actions
- **Grouped updates**: Minor/patch updates grouped to reduce PR noise
- **Ecosystem coverage**: npm (production + dev) and GitHub Actions

### GitHub Actions (`.github/workflows/security.yml`)

- **npm audit**: Runs on every PR and weekly, fails on high/moderate vulnerabilities
- **Gitleaks**: Scans for accidentally committed secrets
- **CodeQL**: Static analysis for JavaScript security issues
- **SBOM generation**: Creates CycloneDX Software Bill of Materials

### Pre-commit Hooks (`.pre-commit-config.yaml`)

Install locally to catch issues before commit:

```bash
pip install pre-commit
pre-commit install
```

Hooks include:
- **Gitleaks**: Block commits containing secrets
- **File checks**: Large files, merge conflicts, private keys
- **Markdown linting**: Keep docs clean

### SBOM (Software Bill of Materials)

**Location:** `sbom.json` is included in every published npm package.

**Format:** [CycloneDX](https://cyclonedx.org/) JSON (industry-standard for supply chain transparency)

The SBOM is automatically regenerated before each npm publish via the `prepublishOnly` hook.

**Regenerate manually:**

```bash
npm run sbom:generate
```

**Direct command (if you need custom options):**

```bash
npx @cyclonedx/cyclonedx-npm --output-file sbom.json --output-format JSON
```

## Security Best Practices for Users

1. **Review before running**: Inspect template files before using in production
2. **Pin versions**: Use specific versions in `package.json` dependencies
3. **Audit regularly**: Run `npm audit` on projects using this package
4. **Least privilege**: Only enable MCP servers you actually need
5. **Secret hygiene**: Never commit API keys or credentials
6. **Use pre-commit hooks**: Install gitleaks to catch secrets before they're committed

## Acknowledgments

We appreciate security researchers who help keep this project safe. Contributors who report valid vulnerabilities will be acknowledged here (with permission).

---

*"Security isn't paranoia. It's preparation." — Beth*
