Run the following pre-deployment checks and builds in an optimized sequence:

## Phase 1: Parallel Validation (Fast Fail)

Run these commands in parallel to catch issues early:

```bash
npm run check & npm run format:check & npm run lint & wait
```

If any command fails, stop and fix the issues before proceeding.

## Phase 2: Apply Formatting (If Needed)

If `format:check` failed in Phase 1, run:

```bash
npm run format
```

## Phase 3: Re-verify After Formatting (If Applied)

If formatting was applied in Phase 2, re-run validation to ensure no issues:

```bash
npm run check && npm run lint
```

## Phase 4: Build for Production

Once all checks pass:

```bash
npm run build
```

---

**Optimization Notes:**

- Phase 1 runs type checking, format checking, and linting in parallel for speed
- Formatting only runs if needed, avoiding unnecessary file writes
- Re-verification only happens if files were modified by formatting
- Build only runs after all quality checks pass
- TypeScript incremental compilation speeds up repeated checks
