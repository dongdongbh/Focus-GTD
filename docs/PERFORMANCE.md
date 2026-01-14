# Performance Guide

## Hot paths

- Task list filtering/sorting (desktop + mobile).
- Project/task ordering updates.
- Sync and attachment reconciliation.

## Known optimizations

- SQLite indexes for status/project/updatedAt.
- Batched upserts for bulk writes.
- Memoized selectors for expensive derived data.

## Tips

- Use `useMemo` for derived sets (contexts/tags).
- Prefer list virtualization for large task lists.
- Avoid deep cloning large arrays on each save.

