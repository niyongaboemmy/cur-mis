# Backend Deploy / Migrate / Seed — GitHub Actions

Three independent, manually-triggerable operations. They are deliberately **not**
bundled together — deploying code never touches the database, and migrating
never seeds data.

| Command | Live (production, GitHub Actions) | Local (your dev DB) | What it does |
|---|---|---|---|
| **deploy** | `composer run deploy:live` (or push to `main`, or Actions tab → "Deploy — Backend (PHP API)" → Run workflow) | — (no local equivalent; you already run the code locally) | Ships PHP source + `vendor/` (if `composer.lock` changed) + `public/` entry point to cPanel, then flushes OPcache. **No migrations, no seeding.** |
| **migrate** | `composer run migrate:live` (or Actions tab → "Migrate — Backend (DB structure)" → Run workflow) | `composer run migrate` (runs `scripts/migrate.php` against `backend/.env`) | Applies pending database migrations (schema/structure) via `MigrationService::runPending()`. Safe to re-run — already-applied migrations are skipped. |
| **seed** | `composer run seed:live -- -f seeder=<name>` (or Actions tab → "Seed — Backend (named data seed)" → Run workflow → pick `<name>` from the dropdown) | `composer run seed -- <name>` (runs `scripts/seed.php <name>` against `backend/.env`) | Runs exactly **one named** data seeder via `SeederService::run($name)`. There is no "run all seeds" option — you must name the seeder. Run `composer run seed` with no name to list available seeders. |

`:live` commands require the [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated (`gh auth login`) — they call `gh workflow run` under the hood, which needs push access to this repo. Without `gh`, use the Actions tab in the GitHub web UI instead.

## Examples

```bash
cd backend

# Local dev DB
composer run migrate
composer run seed -- permissions

# Production (cPanel), via GitHub Actions
composer run migrate:live
composer run seed:live -- -f seeder=permissions
composer run deploy:live
```

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
