# Backend Deploy / Migrate / Seed — GitHub Actions

Three independent, manually-triggerable operations. They are deliberately **not**
bundled together — deploying code never touches the database, and migrating
never seeds data.

| Command | Workflow file | Trigger | What it does |
|---|---|---|---|
| **deploy** | `.github/workflows/deploy-backend.yml` | automatic on push to `main` (paths: `backend/**`), or manual via `workflow_dispatch` | Ships PHP source code + `vendor/` (if `composer.lock` changed) + `public/` entry point to cPanel, then flushes OPcache. **No migrations, no seeding.** |
| **migrate** | `.github/workflows/migrate-backend.yml` | manual only (`workflow_dispatch`) | Applies pending database migrations (schema/structure) via `POST /api/deploy/migrate` → `MigrationService::runPending()`. Safe to re-run — already-applied migrations are skipped. |
| **seed** | `.github/workflows/seed-backend.yml` | manual only (`workflow_dispatch`, requires picking one seeder from a dropdown) | Runs exactly **one named** data seeder via `POST /api/deploy/seed?name=<seeder>`. There is no "run all seeds" option — you must name the seeder. |

## How to run each one

All three are run from GitHub: **Actions tab → select the workflow → Run workflow**.

- **Deploy**: happens automatically on every push to `main` that touches `backend/**`. Can also be triggered manually with no inputs.
- **Migrate**: Actions → "Migrate — Backend (DB structure)" → Run workflow. No inputs needed.
- **Seed**: Actions → "Seed — Backend (named data seed)" → Run workflow → choose a seeder from the `seeder` dropdown (currently: `permissions`).

## Adding a new seeder

1. Create a class in `backend/app/Seeders/` implementing `SeederInterface` (see `PermissionsSeeder.php` for the pattern).
2. Register it in `backend/app/Services/SeederService::REGISTRY` (`'name' => YourSeeder::class`).
3. Add `'name'` to the `options:` list under `inputs.seeder` in `.github/workflows/seed-backend.yml`.

## Underlying API endpoints (protected by `DeployKeyMiddleware`, Bearer `DEPLOY_KEY`)

- `POST /api/deploy/migrate` — run pending migrations
- `GET  /api/deploy/status` — migration status (applied/pending)
- `POST /api/deploy/seed?name=<seeder>` — run one named seeder
- `GET  /api/deploy/seeders` — list available seeder names
- `POST /api/deploy/cache-clear` — reset OPcache
