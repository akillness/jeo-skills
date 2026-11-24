# Online task-query indexes

`20261115-task-query-indexes.sql` adds two PostgreSQL indexes for existing queries:

- `activity(tool_use_id) INCLUDE (is_error) WHERE kind = 'tool_result'` supports the tool-result join in `db/commands.go` (`LEFT JOIN activity r ON r.tool_use_id = u.tool_use_id AND r.kind = 'tool_result'`). That join does not constrain the result row's exploration ID, so the existing `idx_act_tool_call (exploration_id, tool_use_id, id)` has the wrong leading key for it.
- `llm_usage((COALESCE(task_id, '')), model) INCLUDE (task_id, input_tokens, output_tokens, cache_read, cache_write)` covers the per-task model aggregation in `db/llm_usage.go` (`TokenByModel`). That query filters on `COALESCE(task_id,'') = $1` and groups by `model`. The expression matches that predicate; the existing `idx_llm_usage_model (task_id, model)` cannot serve it.

## Apply

```sh
psql -X -v ON_ERROR_STOP=1 -d <database> -f scripts/sql/20261115-task-query-indexes.sql
```

Run it outside a transaction: `CREATE INDEX CONCURRENTLY` cannot run inside one, so do not wrap the file in `BEGIN`/`COMMIT` or use `psql -1`. Use the deployment's normal PostgreSQL authentication.

Both indexes are created concurrently, so normal reads and writes continue. The script sets a 5-second lock timeout, a 10-minute statement timeout and bounded maintenance resources. Its final `VACUUM (ANALYZE)` is an ordinary vacuum, not `VACUUM FULL`; it updates visibility and statistics so the covering index can serve index-only scans.

This is an explicit, one-time maintenance step, not a numbered migration. `db/migrate.go` runs each migration file inside a transaction, where `CONCURRENTLY` is not allowed. A plain `CREATE INDEX` at startup would lock `activity` against writes for the whole build. No application or database restart is required.

## After an interruption

The script intentionally fails if an index with the same name already exists. A partial run may have created the first index before the second failed. An interrupted concurrent build can also leave an invalid index behind. Before retrying, check the state of both indexes:

```sql
SELECT c.relname, i.indisvalid, i.indisready
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname IN ('idx_activity_tool_result_lookup', 'idx_llm_usage_task_model_tokens');
```

Both must show `indisvalid = true` and `indisready = true`. Drop an index that is invalid or not ready with `DROP INDEX CONCURRENTLY`, or run the rollback below, then rerun the script.

## Rollback

```sh
psql -X -v ON_ERROR_STOP=1 -d <database> -f scripts/sql/20261115-task-query-indexes.rollback.sql
```

The rollback drops only these two indexes, concurrently and only if they exist. Table data is kept. Review the current index definitions before applying it. No application restart is required.
