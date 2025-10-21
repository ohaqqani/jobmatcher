# Database Schema Push

Push local schema changes to the Supabase database and configure security policies.

## Prerequisites

- `DATABASE_URL` must be set in your environment
- Schema files in `shared/schemas/` are up to date
- Database connection is active

## Steps

### 1. Validate Environment

```bash
echo $DATABASE_URL | grep -q "postgresql://" && echo "✓ DATABASE_URL is set" || echo "✗ DATABASE_URL missing"
```

### 2. Push Schema Changes

```bash
npx drizzle-kit push
```

This syncs all table definitions from `shared/schemas/index.ts` to the remote database.

**Performance tip:** Use `--force` flag if you've already reviewed the changes and want to skip confirmations.

### 3. Enable Row Level Security

```bash
npx tsx scripts/enable-rls.ts
```

Enables RLS on all tables: `job_descriptions`, `resumes`, `candidates`, `match_results`

**Performance tip:** Skip this step if RLS is already enabled and no new tables were added.

## Verification

After pushing, verify the changes:

```bash
# Check table existence in Supabase Dashboard or via SQL:
psql $DATABASE_URL -c "\dt"

# Verify RLS is enabled:
psql $DATABASE_URL -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';"
```

## Troubleshooting

**Issue:** `DATABASE_URL is not set`
**Fix:** Add `DATABASE_URL` to your `.env` file or export it in your shell

**Issue:** Connection timeout or refused
**Fix:** Check network connection, verify Supabase project is active, confirm DATABASE_URL is correct

**Issue:** Schema push conflicts
**Fix:** Review conflicts with `npx drizzle-kit check`, resolve manually, then retry push

**Issue:** RLS script fails
**Fix:** Tables may already have RLS enabled. Check with verification query above.
