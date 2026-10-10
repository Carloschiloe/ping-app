# Production backup gate

The gate is intentionally stronger than a database dump. Production has four
Auth identities and 48 Storage objects; a schema/data dump alone is not enough.

The operator must produce, outside Supabase and in encrypted storage:

- a custom-format PostgreSQL dump covering the production application schema;
- the Auth-relevant rows needed to preserve the four UUIDs;
- Storage bucket/object metadata;
- the binary backup of all 48 existing Storage objects;
- a restore verification in a disposable target;
- SHA-256 evidence for each artifact and the restore verification.

The evidence file consumed by `validate-backup-gate.mjs` must contain these
non-secret fields:

```json
{
  "projectRef": "wbigqhtuzfmpnxservlf",
  "backupId": "operator-generated-id",
  "schemaBackupSha256": "sha256",
  "dataBackupSha256": "sha256",
  "storageInventoryId": "operator-generated-id",
  "storageBinaryBackupId": "operator-generated-id",
  "storageBinaryBackupSha256": "sha256",
  "restoreVerificationId": "operator-generated-id",
  "createdAt": "2026-10-09T00:00:00Z",
  "encrypted": true,
  "outsideProvider": true,
  "BACKUP_CREATED": "YES",
  "BACKUP_VERIFIED": "YES"
}
```

No secret, URL, token, password, Auth key, or object content belongs in the
evidence JSON. The bridge refuses to run until this gate and the live
read-only schema/policy snapshot both pass.

## Current attempt status (2026-10-10)

The preparation environment attempted only read-only local mechanisms:

- Supabase CLI: unavailable in the execution environment.
- `pg_dump`/`psql`: installed, but no production PostgreSQL connection or
  password was available; no connection was guessed.
- Docker/PostgreSQL rehearsal: Docker daemon unavailable.
- Public Storage listing: the public object-list endpoint did not authorize a
  listing request; no object was downloaded, deleted, moved or permission-
  changed.

Therefore `BACKUP_CREATED=NO` and `BACKUP_VERIFIED=NO` remain truthful. The
snapshot and forward package are ready, but this gate cannot be promoted by
inference or by the public bucket count alone.

## Single local orchestrator

`scripts/production-readiness/run-final-backup-and-precutover.ps1` is the only
entrypoint for the remaining non-mutating gate. It prompts for the production
PostgreSQL connection, Supabase service-role key and encryption passphrase
with hidden input, keeps all three in memory only, creates the database/Auth/
Storage backup outside the repository, encrypts it, writes non-secret evidence,
validates the backup gate and runs the read-only bridge precheck. It never
executes the bridge, migrations, DDL, Render changes or deployment.

Use `-ValidateOnly` to check local tools without entering secrets.
