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

## Security Best Practices for Users

1. **Review before running**: Inspect template files before using in production
2. **Pin versions**: Use specific versions in `package.json` dependencies
3. **Audit regularly**: Run `npm audit` on projects using this package
4. **Least privilege**: Only enable MCP servers you actually need
5. **Secret hygiene**: Never commit API keys or credentials

## Acknowledgments

We appreciate security researchers who help keep this project safe. Contributors who report valid vulnerabilities will be acknowledged here (with permission).

---

*"Security isn't paranoia. It's preparation." — Beth*
