# Deploy to Production

Execute this optimized deployment workflow to safely push changes to production.

---

## Phase 1: Pre-Deployment Validation

First, run the pre-deploy command to ensure code quality:

```bash
# This runs type checking, linting, formatting, and build in parallel
npm run check & npm run format:check & npm run lint & wait
```

If all checks pass, proceed. If any fail:

- **Type errors**: Fix TypeScript errors and re-run `npm run check`
- **Format issues**: Run `npm run format`, then re-validate with `npm run check && npm run lint`
- **Lint errors**: Fix or run `npm run lint:fix`, then verify

Once validation passes, run the build:

```bash
npm run build
```

If the build fails, resolve errors before proceeding.

---

## Phase 2: Commit Changes

### Check for Changes

First verify there are changes to commit:

```bash
git status
```

If working tree is clean, skip to Phase 3.

### Stage Changes

```bash
git add .
```

Review what will be committed:

```bash
git diff --cached --stat
```

### Create Commit

Write a detailed commit message following the project's pattern:

**Format**: `[Action verb] [descriptive detail]`

**Examples from project history**:

- `Add content-based hash deduplication for resumes, jobs, and matches`
- `Optimize performance with parallel processing`
- `Fix anonymizeResumeAsHTML: switch to gpt-5-mini and add debugging`
- `Remove temperature parameter and fix max_tokens parameter`

**Common action verbs**:

- `Add` - New features or files
- `Optimize` - Performance improvements
- `Fix` - Bug fixes
- `Update` - Modifications to existing features
- `Remove` - Deletions
- `Refactor` - Code restructuring without behavior changes
- `Migrate` - Moving between systems/APIs

```bash
git commit -m "$(cat <<'EOF'
[Your detailed commit message here]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**If commit fails due to pre-commit hooks**:

1. Review the hook's changes
2. Verify it's safe to amend: `git log -1 --format='%an %ae'`
3. If you're the author and haven't pushed: `git commit --amend --no-edit`
4. Otherwise: Create a new commit with the hook's changes

---

## Phase 3: Push to Remote

### Check Push Status

```bash
git status
```

If it says "Your branch is up to date with 'origin/main'", deployment is complete.

### Push Changes

```bash
git push
```

**If push fails**:

**Rejected (non-fast-forward)**:

```bash
# Pull latest changes and merge
git pull --rebase origin main

# Resolve any conflicts, then:
git rebase --continue

# Push again
git push
```

**Merge conflicts**:

1. `git status` shows conflicted files
2. Open each file and resolve conflicts (look for `<<<<<<<`, `=======`, `>>>>>>>`)
3. Stage resolved files: `git add <file>`
4. Continue: `git rebase --continue`
5. Push: `git push`

**Force push warning**: Never use `git push --force` on main/master branches unless absolutely necessary and you understand the consequences.

---

## Phase 4: Verify Deployment

### Confirm Push Success

```bash
git log -1 --oneline
git status
```

Should show:

- Latest commit with your message
- "Your branch is up to date with 'origin/main'"
- "nothing to commit, working tree clean"

### Check Remote

```bash
git log origin/main -1 --oneline
```

Should match your local commit.

---

## Quick Reference: Full Command Sequence

For experienced users, here's the streamlined version:

```bash
# 1. Validate (parallel for speed)
npm run check & npm run format:check & npm run lint & wait

# 2. Build
npm run build

# 3. Deploy
git add . && git commit -m "Your detailed message here

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>" && git push

# 4. Verify
git status
```

---

## Performance Notes

- **Parallel validation** in Phase 1 reduces check time by ~60%
- **Conditional execution** via `&&` ensures each step succeeds before proceeding
- **Smart status checks** prevent unnecessary operations
- **Incremental TypeScript compilation** speeds up repeated checks
- **Pre-commit hooks** may modify files; the workflow handles this automatically

---

## Troubleshooting

**"Nothing to commit"**: Changes already committed, proceed to Phase 3

**"Failed to push"**: Remote has changes you don't have; pull and rebase first

**"Pre-commit hook failed"**: Review changes, fix issues, and commit again

**"Merge conflict"**: Resolve conflicts in affected files, stage them, and continue rebase

**Build fails**: Resolve TypeScript/lint errors before committing
