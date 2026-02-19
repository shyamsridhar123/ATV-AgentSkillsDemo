# Contributing to Beth

> *"You want to contribute? Good. Here's how we do things."*

Thanks for your interest in contributing to Beth. This guide covers the PR creation and review process to ensure quality and security.

## Quick Start

1. **Fork and clone** the repository
2. **Create a branch** following our naming convention
3. **Make your changes** following our quality standards
4. **Run quality gates** before creating a PR
5. **Create a PR** with proper description
6. **Address review feedback** promptly

---

## Branch Naming

Use descriptive branch names following this pattern:

```
<type>/<short-description>
```

**Types:**
- `feature/` - New functionality
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `security/` - Security improvements
- `refactor/` - Code improvements without behavior changes
- `test/` - Test additions or improvements

**Examples:**
```
feature/add-deployment-skill
fix/beads-installation-windows
docs/pr-review-process
security/validate-mcp-paths
```

---

## Quality Gates (Pre-PR Checklist)

Before creating a PR, ensure ALL of these pass:

### 1. Tests Pass

```bash
npm test
```

All 33 tests must pass. If you add new functionality, add corresponding tests.

### 2. Security Scans Pass

```bash
# Check for vulnerabilities
npm audit --audit-level=moderate

# Scan for secrets (requires pre-commit hooks)
git add .
git commit -m "Your message"  # pre-commit will run gitleaks
```

### 3. Code Quality

- [ ] No hardcoded secrets or credentials
- [ ] Path validation for any file operations
- [ ] No `shell:true` without security justification (see SECURITY.md)
- [ ] Descriptive commit messages
- [ ] Changes are minimal and focused

### 4. Documentation

If your PR changes behavior or adds features:

- [ ] Update relevant documentation (README.md, docs/, etc.)
- [ ] Add JSDoc comments for new functions
- [ ] Update CHANGELOG.md with your changes

---

## Creating a Pull Request

### PR Title Format

Use a clear, descriptive title:

```
[Type] Short description of change
```

**Examples:**
- `[Feature] Add deployment automation skill`
- `[Fix] Resolve Windows path issues in beads init`
- `[Docs] Document PR and review process`
- `[Security] Add path traversal prevention`

### PR Description Template

```markdown
## Summary
Brief description of what this PR does.

## Changes
- Specific change 1
- Specific change 2
- Specific change 3

## Testing
How you tested these changes:
- [ ] All existing tests pass
- [ ] Added new tests for new functionality
- [ ] Manually verified changes work as expected

## Security Considerations
Any security implications or mitigations:
- [ ] No new security risks introduced
- [ ] Security scans pass (npm audit, gitleaks)
- [ ] Follows security guidelines in SECURITY.md

## Documentation
- [ ] Updated relevant docs
- [ ] Added/updated code comments
- [ ] Updated CHANGELOG.md

## Checklist
- [ ] Branch follows naming convention
- [ ] Tests pass (`npm test`)
- [ ] Security scans pass
- [ ] Documentation updated
- [ ] Commit messages are descriptive
- [ ] Changes are minimal and focused
```

---

## Review Process

### What Reviewers Look For

#### 1. **Security** (Highest Priority)
- [ ] No hardcoded secrets
- [ ] Path validation for file operations
- [ ] Shell execution follows SECURITY.md guidelines
- [ ] Dependencies have no known vulnerabilities
- [ ] Input validation where applicable

#### 2. **Code Quality**
- [ ] Code is clear and maintainable
- [ ] Follows existing patterns and conventions
- [ ] No unnecessary complexity
- [ ] Appropriate error handling
- [ ] Tests cover new functionality

#### 3. **Documentation**
- [ ] Changes are documented
- [ ] Code has helpful comments where needed
- [ ] CHANGELOG.md is updated
- [ ] User-facing changes have usage examples

#### 4. **Functionality**
- [ ] Change solves the stated problem
- [ ] No unintended side effects
- [ ] Edge cases are handled
- [ ] Performance impact is acceptable

### Automated Checks

When you create a PR, these automated checks run:

1. **npm audit** - Dependency vulnerability scanning
2. **Gitleaks** - Secret scanning
3. **CodeQL** - Static security analysis (JavaScript)
4. **SBOM generation** - Software Bill of Materials

All checks must pass before merge.

### Review Timeframe

- **Initial review**: Within 2-3 business days
- **Follow-up**: Within 1-2 business days after updates
- **Security PRs**: Prioritized, reviewed within 24 hours

---

## Addressing Review Feedback

### Good Practices

✅ **DO:**
- Respond to each comment
- Ask for clarification if feedback is unclear
- Make requested changes promptly
- Test thoroughly after changes
- Update your PR description if scope changes

❌ **DON'T:**
- Mark conversations as resolved yourself (let the reviewer do it)
- Force-push after reviews start (use regular commits)
- Ignore automated check failures
- Add unrelated changes to the PR

### Making Changes

```bash
# Make your changes
git add .
git commit -m "Address review feedback: <specific change>"
git push
```

The PR will automatically update. Reviewers will be notified.

---

## Merging

### Requirements for Merge

- [ ] All automated checks pass
- [ ] At least one approval from a maintainer
- [ ] All review conversations resolved
- [ ] No merge conflicts
- [ ] Documentation is up to date

### Merge Strategy

We use **squash and merge** to keep the main branch history clean:

- All commits in your PR will be squashed into a single commit
- The PR title becomes the commit message
- The PR description becomes the commit body
- Your branch will be automatically deleted after merge

---

## After Your PR is Merged

1. **Update Backlog.md** - Your change will be added to the Completed section
2. **Delete your branch** (done automatically)
3. **Pull latest main** to sync your fork
4. **Celebrate** - You've made Beth better 🎉

---

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- Git

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/beth.git
cd beth

# Install dependencies
npm install

# Install pre-commit hooks (recommended)
pip install pre-commit
pre-commit install

# Run tests
npm test
```

### Testing Locally

```bash
# Test the CLI locally
node bin/cli.js init --help

# Run in a test directory
mkdir /tmp/test-beth
cd /tmp/test-beth
node /path/to/beth/bin/cli.js init
```

---

## Common Issues

### Pre-commit Hook Fails

**Problem:** Gitleaks detects a secret

**Solution:**
1. Remove the secret from your code
2. Use environment variables instead
3. Add to `.gitleaks.toml` if it's a false positive (rare)

### npm audit Fails

**Problem:** Dependency has a vulnerability

**Solution:**
1. Check if there's an update: `npm update`
2. Check if it's patchable: `npm audit fix`
3. If unfixable, document in PR why it's acceptable

### Tests Fail

**Problem:** Your changes broke existing tests

**Solution:**
1. Run `npm test` locally
2. Fix the failing tests
3. If behavior change is intentional, update tests
4. Add new tests for your changes

### Merge Conflicts

**Problem:** Your branch conflicts with main

**Solution:**
```bash
git checkout main
git pull origin main
git checkout your-branch
git rebase main
# Resolve conflicts
git add .
git rebase --continue
git push --force-with-lease
```

---

## Questions?

- **Security issues**: See SECURITY.md for responsible disclosure
- **Feature requests**: Open an issue with the `[Feature]` tag
- **Bug reports**: Open an issue with the `[Bug]` tag
- **General questions**: Open a discussion

---

*"Now you know how to contribute. Make it count."* — Beth
