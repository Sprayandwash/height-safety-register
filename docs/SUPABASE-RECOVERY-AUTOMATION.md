# Supabase recovery automation

These workflows prepare the Spray & Wash production database backup and an isolated staging project without exposing database credentials in the public repository.

## Required GitHub Actions secrets

Add these under **Repository Settings > Secrets and variables > Actions**. Never paste their values into an issue, commit, workflow input, or chat.

### Backup workflow

- `SUPABASE_PROD_DB_URL`: the production **Session Pooler** database connection string from Supabase **Connect**.
- `SUPABASE_BACKUP_PASSWORD`: a unique passphrase of at least 16 characters used to encrypt the database backup artifact.

### Staging-project workflow

- `SUPABASE_ACCESS_TOKEN`: a Supabase personal access token with permission to list and create projects.
- `SUPABASE_ORG_ID`: the Supabase organization ID that owns the production project.
- `SUPABASE_STAGING_DB_PASSWORD`: a unique database password of at least 16 characters for the staging project.

Store the backup encryption password and staging database password in the company password manager. GitHub cannot show a secret again after it is saved.

## Run order

1. Run **Supabase logical recovery backup** from the GitHub Actions page.
2. Download the encrypted artifact before its seven-day retention period expires.
3. Run **Create Supabase staging project**.
4. Enter `CREATE STAGING` in the confirmation field.
5. When the project is healthy, open its Supabase **Connect** panel and copy the Session Pooler URL into a repository secret named `SUPABASE_STAGING_DB_URL`.
6. Do not point the live app at the staging project.
7. Restore and Phase 0 rehearsal are separate controlled steps.

## Backup coverage

The encrypted logical backup contains PostgreSQL roles, application schema and database data. Supabase-managed schemas are excluded by the Supabase CLI. Storage object bytes are not part of a logical database dump; keep the separately verified Complete Backup created in the app.

## Public repository safety

The workflows never commit database dumps to the repository. Plaintext dump files exist only temporarily on the GitHub runner and are removed after the encrypted artifact is created.
