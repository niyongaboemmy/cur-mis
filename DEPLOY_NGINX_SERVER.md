# CUR-MIS — Deploying to the Linux + Nginx Production Server

This guide moves CUR-MIS off cPanel shared hosting to a Linux server running
Nginx + PHP-FPM, and replaces the cPanel UAPI upload workflows with an
**SSH + rsync** pipeline in GitHub Actions.

It runs in two phases:

1. **Phase 1, IP address (§0–§9):** the new server runs at `http://<SERVER_IP>/umis/`.
   You build the server, wire up CI, copy the data and test everything, while
   cPanel keeps serving real users at `cur.ac.rw`.
2. **Phase 2, domain (§10):** point `cur.ac.rw` at the server, add HTTPS, retire cPanel.

> **Assumes** Ubuntu 24.04 LTS (Debian 12 works the same; swap the PHP PPA for
> `packages.sury.org`). Replace every `<PLACEHOLDER>` with your real value.

| Placeholder | Meaning |
|---|---|
| `<SERVER_IP>` | Public IP of the new server. Used from day one. |
| `<SSH_PORT>` | SSH port (22 unless changed) |
| `<SITE_URL>` | Base address of the site: `http://<SERVER_IP>` in Phase 1, `https://<DOMAIN>` in Phase 2 |
| `<DOMAIN>` | Public domain, e.g. `cur.ac.rw`. Phase 2 only. |
| `<DB_NAME>` / `<DB_USER>` / `<DB_PASS>` | Production MariaDB credentials |

---

## 0. Phase 1 — running on the IP address

The URL paths stay exactly as they are on cPanel. Only the host part changes:

| Phase 1 URL | Phase 2 URL | Component | Repo folder |
|---|---|---|---|
| `http://<SERVER_IP>/umis/` | `https://<DOMAIN>/umis/` | React SPA | `frontend/` (built `dist/`) |
| `http://<SERVER_IP>/umis/api/` | `https://<DOMAIN>/umis/api/` | PHP API | `backend/` |
| `http://<SERVER_IP>/umis/cdn/` | `https://<DOMAIN>/umis/cdn/` | File server | `file-server/` |
| `http://<SERVER_IP>/payment_api/` | `https://<DOMAIN>/payment_api/` | UrubutoPay callbacks | `payment_api/` |

Every setting that depends on the address reads from **one value**, `<SITE_URL>`.
Moving to the domain later means changing it in these places and redeploying:

| Where | Setting | Phase 1 value |
|---|---|---|
| GitHub → Settings → Variables | `SITE_URL` | `http://<SERVER_IP>` |
| `backend/shared/.env` | `APP_URL` | `http://<SERVER_IP>/umis/api` |
| `backend/shared/.env` | `APP_FRONTEND_URL` | `http://<SERVER_IP>/umis` |
| `backend/shared/.env` | `CORS_ALLOWED_ORIGINS` | `http://<SERVER_IP>` |
| `backend/shared/.env` | `FILE_SERVER_URL` | `http://<SERVER_IP>/umis/cdn` |

The frontend's API address (`VITE_API_URL`) is fixed into the JavaScript
bundle at build time. The new workflow builds it from the `SITE_URL` variable
(§8), so `frontend/.env.production` doesn't need editing.

**Limits of Phase 1 (by design):**

- **Plain HTTP.** Passwords and login tokens travel unencrypted. Test with
  staff accounts only, and don't send real users to the IP. Optionally allow
  only campus IPs in Nginx (`allow <CAMPUS_RANGE>; deny all;` inside the `server` block).
- **No service worker or push notifications.** Browsers only allow them on
  HTTPS (or `localhost`), so their absence here is expected.
- **The `migrate` / `seed` / `migration-status` / `baseline` workflows still hit cPanel.**
  Their `API_BASE` is hard-coded to `https://cur.ac.rw/umis/api`. Run them over SSH on the new server instead (§9).
- **Legacy PHP apps stay on cPanel.** The SPA embeds pages by full URL that
  are **not in this repo**: `https://cur.ac.rw/umis/documents/…` (certificates,
  registrar reports, student account), `/umis/finance/…` (bank slip, billing
  login), `/umis/old_applicants/` and `/mis/main/img/…`. In Phase 1 they
  keep loading from cPanel. Phase 2 has to copy them across (§10).
- **UrubutoPay keeps calling cPanel.** The registered callback URL still points
  at `cur.ac.rw/payment_api/`, so payments made in Phase 1 land in the cPanel database.

---

## 1. Target layout on the server

Each deployable component keeps a set of **releases**. `current` is a symlink
that is swapped atomically, so a deploy never leaves a half-copied site, and a
rollback just moves the symlink back.

```
/srv/cur-mis/
├── bin/
│   ├── activate          # link shared files, swap `current`, reload PHP-FPM, prune
│   └── rollback          # point `current` at the previous release
├── backend/
│   ├── releases/20261026120000-ab12cd3/   # app/ core/ config/ vendor/ public/ …
│   ├── current -> releases/<latest>
│   ├── shared/
│   │   ├── .env          # production backend env (created once, by hand)
│   │   ├── logs/
│   │   └── storage/
│   └── .env -> shared/.env   # payment_api reads ../backend/.env
├── frontend/
│   ├── releases/<rel>/   # contents of frontend/dist
│   └── current -> releases/<latest>
├── file-server/
│   ├── releases/<rel>/
│   ├── current -> releases/<latest>
│   └── shared/
│       ├── .env
│       └── storage/uploads/   # ALL uploaded documents live here
└── payment_api/          # synced in place (no releases, see §8.4)
```

Why this works without code changes:

- `backend/public/index.php` resolves `BASE_PATH` as `dirname(__DIR__)` when
  `vendor/autoload.php` sits there, which is true inside every release.
- `Core\Request` strips `dirname($_SERVER['SCRIPT_NAME'])` from the URI, so
  Nginx passes `SCRIPT_NAME=/umis/api/index.php` and routes still see `/api/...`
  (effective base `/umis/api/api`, as today).
- `payment_api/*.php` load `__DIR__/../backend/.env`, which maps to
  `/srv/cur-mis/backend/.env` → `shared/.env`.

---

## 2. One-time server provisioning

Run as a sudo-capable user on the new server.

### 2.1 Base packages, PHP 8.4, MariaDB, Nginx

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install software-properties-common curl unzip rsync git ufw fail2ban

# PHP 8.4 (Ondřej Surý PPA)
sudo add-apt-repository -y ppa:ondrej/php
sudo apt update
sudo apt -y install php8.4-fpm php8.4-cli php8.4-mysql php8.4-mbstring php8.4-xml \
  php8.4-gd php8.4-zip php8.4-curl php8.4-intl php8.4-bcmath php8.4-opcache

# Web + DB
sudo apt -y install nginx mariadb-server certbot python3-certbot-nginx

sudo systemctl enable --now php8.4-fpm nginx mariadb
php -v && nginx -v && mariadb --version
```

The extensions cover dompdf (`gd`, `mbstring`, `xml`), PhpSpreadsheet (`zip`, `xml`, `gd`),
QR codes (`gd`), PHPMailer (`openssl`, part of core) and PDO MySQL.

### 2.2 Firewall

```bash
sudo ufw allow <SSH_PORT>/tcp
sudo ufw allow 'Nginx Full'      # 80 + 443
sudo ufw enable
```

SSH only needs to be reachable from the campus network/VPN. Deploys use a
self-hosted runner that only connects outward (§7), so SSH never has to be
open to the internet.

### 2.3 Deploy user (used by GitHub Actions)

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG www-data deploy
sudo mkdir -p /home/deploy/.ssh && sudo chmod 700 /home/deploy/.ssh
```

On **your machine**, create a dedicated key pair for CI (no passphrase):

```bash
ssh-keygen -t ed25519 -C "github-actions@cur-mis" -f ~/.ssh/curmis_deploy -N ""
cat ~/.ssh/curmis_deploy.pub     # → paste into the server's authorized_keys
```

On the server:

```bash
echo "<PASTE PUBLIC KEY>" | sudo tee /home/deploy/.ssh/authorized_keys
sudo chmod 600 /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
```

Harden SSH in `/etc/ssh/sshd_config` (check you can still log in with a key in a second terminal before closing the first one):

```
PasswordAuthentication no
PermitRootLogin no
```

```bash
sudo systemctl reload ssh
```

Let `deploy` reload PHP-FPM and Nginx without a password, and nothing else:

```bash
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl reload php8.4-fpm, /usr/bin/systemctl reload nginx, /usr/sbin/nginx -t' \
  | sudo tee /etc/sudoers.d/deploy-curmis
sudo chmod 440 /etc/sudoers.d/deploy-curmis
sudo visudo -c
```

### 2.4 Directory tree and permissions

```bash
sudo mkdir -p /srv/cur-mis/{bin,payment_api} \
  /srv/cur-mis/backend/{releases,shared/logs,shared/storage} \
  /srv/cur-mis/frontend/releases \
  /srv/cur-mis/file-server/{releases,shared/storage/uploads}

sudo chown -R deploy:www-data /srv/cur-mis
# Directories PHP must write to: group-writable, setgid so new files keep the www-data group
sudo chmod -R 2775 /srv/cur-mis/backend/shared/{logs,storage} /srv/cur-mis/file-server/shared/storage
```

Code is owned by `deploy` and read-only to PHP (`www-data`). PHP can only
write to `shared/logs` and `shared/storage`.

### 2.5 PHP configuration

`/etc/php/8.4/fpm/conf.d/99-curmis.ini`:

```ini
memory_limit = 512M
upload_max_filesize = 50M
post_max_size = 55M
max_execution_time = 120
date.timezone = Africa/Kigali
expose_php = Off

opcache.enable = 1
opcache.memory_consumption = 256
opcache.max_accelerated_files = 20000
opcache.validate_timestamps = 1
opcache.revalidate_freq = 2
```

Dedicated FPM pool, `/etc/php/8.4/fpm/pool.d/curmis.conf`:

```ini
[curmis]
user = www-data
group = www-data
listen = /run/php/curmis.sock
listen.owner = www-data
listen.group = www-data
pm = dynamic
pm.max_children = 40
pm.start_servers = 8
pm.min_spare_servers = 4
pm.max_spare_servers = 10
pm.max_requests = 500
request_terminate_timeout = 300
```

Size `pm.max_children` to RAM: roughly `(RAM − 1 GB for MariaDB/OS) / 60 MB`.

```bash
sudo php-fpm8.4 -t && sudo systemctl reload php8.4-fpm
```

### 2.6 MariaDB database

```bash
sudo mariadb-secure-installation
sudo mariadb <<'SQL'
CREATE DATABASE <DB_NAME> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER '<DB_USER>'@'localhost' IDENTIFIED BY '<DB_PASS>';
GRANT ALL PRIVILEGES ON <DB_NAME>.* TO '<DB_USER>'@'localhost';
FLUSH PRIVILEGES;
SQL
```

MariaDB listens on `127.0.0.1` only by default. Keep it that way.

---

## 3. Server-side helper scripts

### 3.1 `/srv/cur-mis/bin/activate`

```bash
#!/usr/bin/env bash
# Usage: activate <backend|frontend|file-server> <release-name>
# Links shared files into the release, atomically swaps `current`,
# reloads PHP-FPM (resets OPcache + realpath cache), keeps the last 5 releases.
set -euo pipefail

APP="$1"; REL="$2"
ROOT="/srv/cur-mis/$APP"
DIR="$ROOT/releases/$REL"
KEEP=5

[ -d "$DIR" ] || { echo "Release $DIR not found" >&2; exit 1; }

case "$APP" in
  backend)
    ln -sfn "$ROOT/shared/.env" "$DIR/.env"
    rm -rf "$DIR/logs" "$DIR/storage"
    ln -sfn "$ROOT/shared/logs"    "$DIR/logs"
    ln -sfn "$ROOT/shared/storage" "$DIR/storage"
    ;;
  file-server)
    ln -sfn "$ROOT/shared/.env" "$DIR/.env"
    rm -rf "$DIR/storage"
    ln -sfn "$ROOT/shared/storage" "$DIR/storage"
    ;;
  frontend) ;;
  *) echo "Unknown app: $APP" >&2; exit 1 ;;
esac

# Atomic swap: create the new link beside the old one, then rename over it
ln -sfn "$DIR" "$ROOT/current.new"
mv -Tf "$ROOT/current.new" "$ROOT/current"
echo "$APP → $REL"

if [ "$APP" != frontend ]; then
  sudo /usr/bin/systemctl reload php8.4-fpm
fi

# Prune old releases (never the one now live)
ls -1dt "$ROOT"/releases/*/ | tail -n +$((KEEP + 1)) | xargs -r rm -rf
```

### 3.2 `/srv/cur-mis/bin/rollback`

```bash
#!/usr/bin/env bash
# Usage: rollback <backend|frontend|file-server> [release-name]
# Without a release name, goes back to the release before the live one.
set -euo pipefail

APP="$1"; ROOT="/srv/cur-mis/$APP"
LIVE="$(basename "$(readlink -f "$ROOT/current")")"

if [ $# -ge 2 ]; then
  TARGET="$2"
else
  TARGET="$(ls -1t "$ROOT/releases" | grep -vx "$LIVE" | head -n1)"
fi
[ -n "$TARGET" ] || { echo "No earlier release to roll back to" >&2; exit 1; }

ln -sfn "$ROOT/releases/$TARGET" "$ROOT/current.new"
mv -Tf "$ROOT/current.new" "$ROOT/current"
[ "$APP" = frontend ] || sudo /usr/bin/systemctl reload php8.4-fpm
echo "$APP rolled back: $LIVE → $TARGET"
```

```bash
sudo chown deploy:deploy /srv/cur-mis/bin/*
sudo chmod 755 /srv/cur-mis/bin/*
```

> Rollback swaps **code only**. It does not undo database migrations. That
> matches the deploy/migrate split in [DEPLOY_MIGRATE_SEED.md](DEPLOY_MIGRATE_SEED.md).

---

## 4. Shared configuration (created once, never deployed by CI)

### 4.1 Backend `.env`

Start from `backend/.env.example` (or copy the current production `.env` from
cPanel `public_html/umis/backend/.env`), then edit:

```bash
sudo -u deploy nano /srv/cur-mis/backend/shared/.env
```

Values that must be correct on the new server. These are the Phase 1 values,
on the IP address. In Phase 2 (§10.2, step 8) the four URLs change to `https://<DOMAIN>/...`.

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=http://<SERVER_IP>/umis/api
APP_FRONTEND_URL=http://<SERVER_IP>/umis
CORS_ALLOWED_ORIGINS=http://<SERVER_IP>

DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=<DB_NAME>
DB_USERNAME=<DB_USER>
DB_PASSWORD=<DB_PASS>

FILE_SERVER_URL=http://<SERVER_IP>/umis/cdn
FILE_SERVER_KEY=<same value as file-server .env>

DEPLOY_KEY=<same value as the DEPLOY_KEY GitHub secret>
# JWT_SECRET: keep the cPanel value, otherwise every logged-in user is logged out
# MAIL_*, VAPID_*, URUBUTOPAY_*, ANTHROPIC_API_KEY: copy from the cPanel .env
```

```bash
sudo chown deploy:www-data /srv/cur-mis/backend/shared/.env
sudo chmod 640 /srv/cur-mis/backend/shared/.env
ln -sfn /srv/cur-mis/backend/shared/.env /srv/cur-mis/backend/.env   # for payment_api
```

### 4.2 File-server `.env`

```bash
sudo -u deploy nano /srv/cur-mis/file-server/shared/.env
```

```dotenv
APP_NAME=CUR-MIS File Server
APP_ENV=production
APP_DEBUG=false
FILE_SERVER_KEY=<must equal backend FILE_SERVER_KEY>
MAX_UPLOAD_SIZE=52428800
```

```bash
sudo chown deploy:www-data /srv/cur-mis/file-server/shared/.env
sudo chmod 640 /srv/cur-mis/file-server/shared/.env
```

If the two `FILE_SERVER_KEY` values differ, the file server answers 401 and every upload fails.

---

## 5. Nginx

### 5.1 FastCGI snippet: `/etc/nginx/snippets/curmis-fcgi.conf`

Each PHP location sets its own `SCRIPT_FILENAME`, `SCRIPT_NAME` and
`DOCUMENT_ROOT`, so this snippet leaves those three out and they are never sent twice.

```nginx
fastcgi_param QUERY_STRING      $query_string;
fastcgi_param REQUEST_METHOD    $request_method;
fastcgi_param CONTENT_TYPE      $content_type;
fastcgi_param CONTENT_LENGTH    $content_length;
fastcgi_param REQUEST_URI       $request_uri;
fastcgi_param DOCUMENT_URI      $document_uri;
fastcgi_param SERVER_PROTOCOL   $server_protocol;
fastcgi_param REQUEST_SCHEME    $scheme;
fastcgi_param HTTPS             $https if_not_empty;
fastcgi_param GATEWAY_INTERFACE CGI/1.1;
fastcgi_param SERVER_SOFTWARE   nginx;
fastcgi_param REMOTE_ADDR       $remote_addr;
fastcgi_param REMOTE_PORT       $remote_port;
fastcgi_param SERVER_ADDR       $server_addr;
fastcgi_param SERVER_PORT       $server_port;
fastcgi_param SERVER_NAME       $server_name;
fastcgi_param REDIRECT_STATUS   200;

fastcgi_read_timeout 300;
fastcgi_buffers 16 16k;
fastcgi_buffer_size 32k;
fastcgi_pass unix:/run/php/curmis.sock;
```

Nginx forwards every request header to PHP as `HTTP_*`, including
`Authorization` → `HTTP_AUTHORIZATION`. The Apache rewrite tricks in the
`.htaccess` files aren't needed here.

### 5.2 Shared locations: `/etc/nginx/snippets/curmis-locations.conf`

The site's routing lives in one snippet. The Phase 1 IP server (§5.3) and the
Phase 2 HTTPS server (§10) both include it, so the routing never changes between phases.

```nginx
server_tokens off;
client_max_body_size 55m;

gzip on;
gzip_comp_level 5;
gzip_types text/css application/javascript application/json image/svg+xml text/plain;

# Never serve dotfiles (.env, .git, .htaccess …)
location ~ /\.(?!well-known) { deny all; }

location = / { return 302 /umis/; }

# ── PHP API: /umis/api/ → backend/current/public/index.php ──────────────────
location = /umis/api { return 301 /umis/api/; }
location ^~ /umis/api/ {
    alias /srv/cur-mis/backend/current/public/;

    location ~* \.(env|json|lock|log|md|sql|phar|sh)$ { deny all; }

    # Standalone scripts that live in public/ and are called directly
    location ~ ^/umis/api/(api-docs|admin-extend-offer)\.php$ {
        include snippets/curmis-fcgi.conf;
        fastcgi_param SCRIPT_FILENAME /srv/cur-mis/backend/current/public/$1.php;
        fastcgi_param SCRIPT_NAME     /umis/api/$1.php;
        fastcgi_param DOCUMENT_ROOT   /srv/cur-mis/backend/current/public;
    }

    # Any other *.php goes to the front controller and is never served as text
    location ~ \.php$ { try_files /__nonexistent__ @backend; }

    # Real static files (logo.png …) are served directly, everything else → router
    try_files $uri @backend;
}
location @backend {
    include snippets/curmis-fcgi.conf;
    fastcgi_param SCRIPT_FILENAME /srv/cur-mis/backend/current/public/index.php;
    fastcgi_param SCRIPT_NAME     /umis/api/index.php;
    fastcgi_param DOCUMENT_ROOT   /srv/cur-mis/backend/current/public;
}

# ── File server: /umis/cdn/ → file-server/current/public/index.php ──────────
location = /umis/cdn { return 301 /umis/cdn/; }
location ^~ /umis/cdn/ {
    alias /srv/cur-mis/file-server/current/public/;
    location ~ \.php$ { try_files /__nonexistent__ @fileserver; }
    try_files $uri @fileserver;
}
location @fileserver {
    include snippets/curmis-fcgi.conf;
    fastcgi_param SCRIPT_FILENAME /srv/cur-mis/file-server/current/public/index.php;
    fastcgi_param SCRIPT_NAME     /umis/cdn/index.php;
    fastcgi_param DOCUMENT_ROOT   /srv/cur-mis/file-server/current/public;
}

# ── UrubutoPay callbacks: /payment_api/*.php ─────────────────────────────────
location ^~ /payment_api/ {
    root /srv/cur-mis;

    add_header Access-Control-Allow-Origin  "*" always;
    add_header Access-Control-Allow-Methods "POST, GET, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
    if ($request_method = OPTIONS) { return 204; }

    location ~* \.(env|log|sql|bak)$ { deny all; }
    location ~ \.php$ {
        try_files $uri =404;
        include snippets/curmis-fcgi.conf;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param SCRIPT_NAME     $fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT   $document_root;
    }
}

# ── React SPA: /umis/ → frontend/current (Vite dist) ─────────────────────────
location = /umis { return 301 /umis/; }
location ^~ /umis/ {
    alias /srv/cur-mis/frontend/current/;
    try_files $uri $uri/ /umis/index.html;

    # index.html is never cached, so browsers always get the latest chunk hashes
    location = /umis/index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    # Service worker + manifest are re-checked on every load, so installed apps get new releases
    location ~ ^/umis/(sw\.js|manifest\.webmanifest)$ {
        add_header Cache-Control "no-cache, must-revalidate";
    }
    # Hashed Vite chunks never change, so they can be cached for a year
    location ^~ /umis/assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

Nginx always picks the longest `^~` prefix, so `/umis/api/` and `/umis/cdn/` win over `/umis/`.

### 5.3 Phase 1 site (IP address): `/etc/nginx/sites-available/cur-mis`

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;                 # answers on http://<SERVER_IP>

    # Optional while testing: allow the campus network only
    # allow <CAMPUS_RANGE>;
    # deny  all;

    include snippets/curmis-locations.conf;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/cur-mis /etc/nginx/sites-enabled/cur-mis
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

curl -sI http://<SERVER_IP>/umis/ | head -1     # 200 once the frontend is deployed (§8)
```

---

## 6. TLS certificate

Phase 1 runs on plain HTTP, so there is nothing to do here yet. The
certificate is issued for the domain in Phase 2 (§10, step 7), as soon as `<DOMAIN>` resolves to `<SERVER_IP>`.

---

## 7. GitHub configuration — self-hosted runner

The server (`cur-svr`, `10.10.93.183`) is on a **private campus network**, so
GitHub's cloud runners can't reach it over SSH. A **self-hosted runner** runs
on the server as the `deploy` user. It only makes outgoing connections to
GitHub, so no inbound access is needed.

### 7.1 Guards (the repo is public)

On a public repo, a fork's pull request could edit a workflow to target the
runner and run code inside the campus network. These guards are in place:

| Guard | Where |
|---|---|
| Every outside contributor's workflow run needs manual approval | Settings → Actions → General → *Fork pull request workflows from outside collaborators* = **Require approval for all outside collaborators** (`approval_policy=all_external_contributors`, set 2026-10-27) |
| Runner only picks up jobs that name its custom label | Registered with `--labels cur-svr-prod --no-default-labels` |
| Runner runs as `deploy`, not root | It can write `/srv/cur-mis` and reload PHP-FPM/Nginx, nothing else (`/etc/sudoers.d/deploy-curmis`) |
| Code is built in the cloud, not on the server | `build_*` jobs run on `ubuntu-latest`; the server only unpacks the artifact |
| Deploy jobs refuse anything but `main` of this repo | `if: github.repository == 'niyongaboemmy/cur-mis' && github.ref == 'refs/heads/main' && github.event_name != 'pull_request'` |

**Never approve a workflow run from a fork without reading its workflow changes.**

### 7.2 Register the runner (done once)

The campus network throttles GitHub's download CDN (`185.199.108–111.x`; measured
at <1 KB/s). Everything the runner uses during a job is unaffected: job queue,
`codeload`, and artifact storage on `blob.core.windows.net`. The one-time runner
download goes through a machine on the VPN instead:

```bash
# On a Mac/PC on the VPN
VER=2.338.2
curl -fsSLO https://github.com/actions/runner/releases/download/v$VER/actions-runner-linux-x64-$VER.tar.gz
shasum -a 256 actions-runner-linux-x64-$VER.tar.gz      # compare with the release notes
scp -i ~/.ssh/curmis_deploy actions-runner-linux-x64-$VER.tar.gz deploy@10.10.93.183:actions-runner/runner.tgz

# Registration token (valid 1 h) piped straight to the server, never printed
gh api -X POST repos/niyongaboemmy/cur-mis/actions/runners/registration-token --jq .token \
 | ssh -i ~/.ssh/curmis_deploy deploy@10.10.93.183 'cd ~/actions-runner && tar xzf runner.tgz && rm runner.tgz &&
     IFS= read -r T && ./config.sh --unattended --replace --url https://github.com/niyongaboemmy/cur-mis \
       --token "$T" --name cur-svr --labels cur-svr-prod --no-default-labels --disableupdate --work _work'
```

`--disableupdate` stops the runner from updating itself through the throttled
CDN. To upgrade it, repeat the download above. GitHub stops accepting runners
that are too old, and a warning appears in the Actions log first.

Run it as a **user service of `deploy`**. No root is needed, and "linger"
keeps it running without a login session and across reboots:

```bash
# as deploy
loginctl enable-linger deploy
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/actions-runner.service <<'EOF'
[Unit]
Description=GitHub Actions runner (cur-svr, cur-mis deploys)
After=network-online.target

[Service]
WorkingDirectory=%h/actions-runner
ExecStart=%h/actions-runner/run.sh
Restart=always
RestartSec=10
KillMode=control-group
KillSignal=SIGTERM
TimeoutStopSec=5min

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now actions-runner.service
```

| Task (as `deploy`) | Command |
|---|---|
| Status | `systemctl --user status actions-runner` |
| Logs | `journalctl --user -u actions-runner -f` |
| Restart | `systemctl --user restart actions-runner` |

Don't also install it with `./svc.sh install`; that would run a second copy.
The runner shows as **Idle** under Settings → Actions → Runners.

### 7.3 Repository variable

Settings → Secrets and variables → Actions → **Variables**:

| Variable | Phase 1 value | Phase 2 value |
|---|---|---|
| `SITE_URL` | `http://10.10.93.183` | `https://cur.ac.rw` |

The workflow uses it for the frontend's API address (`VITE_API_URL`) and for the
post-deploy checks. The new workflow needs **no SSH secrets**. `DEPLOY_KEY`
stays as it is for the migrate/seed workflows.

### 7.4 Old cPanel deploy workflows — keep them on during Phase 1

cPanel still serves real users during Phase 1, so **leave the cPanel workflows
enabled**. Every push to `main` deploys to both servers. Disable them only at
the end of Phase 2 (§10.2, step 12):

```bash
gh workflow disable deploy-backend.yml
gh workflow disable deploy-frontend.yml
gh workflow disable deploy-file-server.yml
gh workflow disable deploy-payment-api.yml
gh workflow disable deploy-billing-frontend.yml
gh workflow disable deploy-to-cpanel.yml
```

Keep them in the repo until the new server has run stably for a while, then delete them.

### 7.5 Admin SSH access

`~/.ssh/curmis_deploy` (on the admin Mac) logs in as `deploy@10.10.93.183` over
the VPN, for manual rollbacks and checks. fail2ban whitelists `10.10.0.0/16`
(`/etc/fail2ban/jail.local`), so admins on the VPN can't be banned by mistake.
If you connect from another range, always use key-only options
(`-o BatchMode=yes -o PasswordAuthentication=no`): six failed password
attempts get an address banned for an hour.

---

## 8. The workflow: `.github/workflows/deploy-server.yml`

The file is in the repo. Here's what it does:

| Job | Runs on | Does |
|---|---|---|
| `plan` | GitHub cloud | Picks which components changed (or the one chosen in a manual run), names the release `YYYYMMDDHHMMSS-<sha7>` |
| `build_backend` / `build_file_server` | GitHub cloud | `composer install --no-dev`, packs source + `vendor/` (no `.env`, logs, storage, tests or `test_*.php`) |
| `build_frontend` | GitHub cloud | `npm ci`, type-check, `vite build` with `VITE_API_URL=${SITE_URL}/umis/api` |
| `build_payment_api` | GitHub cloud | Packs `payment_api/` |
| `deploy_*` | **cur-svr** runner | Downloads the artifact, unpacks it into `/srv/cur-mis/<app>/releases/<rel>` (unchanged files hard-linked against the live release), runs `bin/activate`, then a health check |

- **Trigger:** push to `main` touching `backend/`, `frontend/`, `file-server/`,
  `payment_api/` or the workflow itself. Or **Actions → Deploy — Production server
  → Run workflow**, with `component` set to `auto | all | backend | frontend | file_server | payment_api`.
- **First deploy:** run it manually with `component: all`.
- **Never touches the database.** See §9.
- `payment_api` is synced in place, without `--delete`, so runtime logs survive.
- Once the cPanel workflows are disabled (Phase 2), change the root `package.json`
  script to `"deploy": "gh workflow run deploy-server.yml -f component=backend"`.

---

## 9. Migrations and seeds on the new server

**Phase 1 (IP address): over SSH.** The existing `migrate-backend.yml` /
`seed-backend.yml` / `migration-status.yml` / `baseline-backend.yml` call
`https://cur.ac.rw/umis/api/...`, which is still cPanel. Don't run them for
the new server yet. Run the scripts directly on the server:

```bash
ssh -p <SSH_PORT> deploy@<SERVER_IP> 'cd /srv/cur-mis/backend/current && php scripts/migrate.php'
ssh -p <SSH_PORT> deploy@<SERVER_IP> 'cd /srv/cur-mis/backend/current && php scripts/seed.php permissions'
ssh -p <SSH_PORT> deploy@<SERVER_IP> 'cd /srv/cur-mis/backend/current && php scripts/migrate.php --baseline'   # one-time reconcile only
```

**Phase 2 (domain): nothing changes.** Once `cur.ac.rw` points at the new
server, the existing workflows reach it with the same `DEPLOY_KEY`:

```bash
npm run migrate:live
npm run seed:live -- -f seeder=permissions
```

---

## 10. Phase 2 — move the domain to the new server

### 10.1 Decide: does the whole domain move?

- **Yes, all of `<DOMAIN>` moves (recommended).** Keep the same paths. Then the
  legacy PHP apps (`/umis/documents/`, `/umis/finance/`, `/umis/old_applicants/`,
  `/mis/`) and anything else under `public_html` on cPanel **must be copied to
  the new server too**, each with its own Nginx `location` (and its own database,
  if it has one). Otherwise those screens inside the SPA break the moment DNS switches.
  List them first: on cPanel, `ls ~/public_html ~/public_html/umis`.
- **No, the main site stays on cPanel.** DNS can't split one domain by path. Use a
  subdomain (e.g. `mis.<DOMAIN>`) as `<SITE_URL>`, and also change `API_BASE` in
  `migrate-backend.yml` / `seed-backend.yml` / `migration-status.yml` /
  `baseline-backend.yml` and the callback URL registered with UrubutoPay.

The steps below assume the whole domain moves.

### 10.2 Cutover steps

**A few days before**

1. Lower the TTL of the `<DOMAIN>` A record (and `www`) to **300 s**, so the switch spreads quickly.
2. Finish Phase 1 and test fully on `http://<SERVER_IP>/umis/`: log in, open
   student lists, download a PDF letter, upload and view a document, and check
   `http://<SERVER_IP>/umis/api/api/health`.
3. Copy the legacy PHP apps (10.1) to the server and add their locations to
   `snippets/curmis-locations.conf`. Test them on the IP too.
4. Add the HTTPS site next to the IP one. Edit `/etc/nginx/sites-available/cur-mis`:
   ```nginx
   # IP access → send to the domain once it's live (enable at step 9)
   server {
       listen 80 default_server;
       listen [::]:80 default_server;
       server_name _;
       include snippets/curmis-locations.conf;      # step 9: replace with
       # return 301 https://<DOMAIN>$request_uri;
   }

   server {
       listen 80;
       listen [::]:80;
       server_name <DOMAIN> www.<DOMAIN>;
       location /.well-known/acme-challenge/ { root /var/www/html; }
       location / { return 301 https://<DOMAIN>$request_uri; }
   }

   # Uncomment after certbot has issued the certificate (step 7)
   # server {
   #     listen 443 ssl http2;          # Nginx 1.24 syntax (`http2 on;` needs 1.25.1+)
   #     listen [::]:443 ssl http2;
   #     server_name <DOMAIN> www.<DOMAIN>;
   #     ssl_certificate     /etc/letsencrypt/live/<DOMAIN>/fullchain.pem;
   #     ssl_certificate_key /etc/letsencrypt/live/<DOMAIN>/privkey.pem;
   #     include /etc/letsencrypt/options-ssl-nginx.conf;
   #     add_header Strict-Transport-Security "max-age=31536000" always;
   #     include snippets/curmis-locations.conf;
   # }
   ```

**Cutover day**

5. Put cPanel into a maintenance window (announce it), then take the **final**
   database dump and file copy. Repeat §10.3 so every change since the trial copy comes across.
6. Change the DNS A record(s) of `<DOMAIN>` to `<SERVER_IP>`. Wait until
   `dig +short <DOMAIN>` returns the new IP.
7. Issue the certificate, then uncomment the 443 block and reload:
   ```bash
   sudo certbot certonly --webroot -w /var/www/html -d <DOMAIN> -d www.<DOMAIN> \
     -m it@<DOMAIN> --agree-tos -n
   sudo nginx -t && sudo systemctl reload nginx
   systemctl status certbot.timer        # auto-renewal is installed by the package
   ```
   If HTTPS must work at the exact moment DNS flips, install the cPanel
   certificate and key instead (**SSL/TLS → Manage SSL sites → export**), and move to certbot later.
8. Switch every address to the domain:
   - GitHub variable `SITE_URL` → `https://<DOMAIN>`
   - `backend/shared/.env`: `APP_URL`, `APP_FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`,
     `FILE_SERVER_URL` → `https://<DOMAIN>/...`, then `sudo systemctl reload php8.4-fpm`
   - Run **Deploy — Production server** with `component: frontend`, so the bundle is rebuilt with the new API address.
9. Turn on the IP → domain redirect in the `default_server` block (step 4), then
   reload Nginx.
10. Run `npm run migrate:live` in case the code is ahead of the imported schema.
11. Verify:
    ```bash
    curl -fsS https://<DOMAIN>/umis/api/api/health
    curl -sI  https://<DOMAIN>/umis/ | head -1
    curl -sI  https://<DOMAIN>/umis/api/.env | head -1             # must be 403/404
    curl -sI  https://<DOMAIN>/umis/api/test_auth.php | head -1    # must not run the test script
    curl -sI  https://<DOMAIN>/umis/documents/ | head -1           # legacy app moved
    ```
    Then log in from a browser and test one full flow: a payment callback, a
    password-reset email, and a document upload.
12. Disable the old cPanel workflows (§7.4). Keep the cPanel account read-only
    for at least two weeks as a fallback, then cancel it.

**Rollback of the cutover:** point DNS back to cPanel. Any data written on the
new server after the switch must be dumped and moved back by hand, so decide quickly.

### 10.3 Copying data from cPanel

Do a trial copy during Phase 1 and the final copy on cutover day.

Database:

```bash
# on cPanel (Terminal/SSH) — or phpMyAdmin → Export → Custom → SQL
mysqldump --single-transaction --routines --triggers --events \
  -u <CPANEL_DB_USER> -p <CPANEL_DB_NAME> | gzip > curmis-$(date +%F).sql.gz

# on the new server
gunzip -c curmis-YYYY-MM-DD.sql.gz \
  | sed -E 's/DEFINER=`[^`]+`@`[^`]+`//g' \
  | mariadb -u <DB_USER> -p <DB_NAME>
```

Uploaded files (not in Git):

```bash
# from the new server, if cPanel allows SSH:
rsync -avz -e "ssh -p <CPANEL_SSH_PORT>" curac@<CPANEL_HOST>:file-server/storage/uploads/ \
  /srv/cur-mis/file-server/shared/storage/uploads/
rsync -avz -e "ssh -p <CPANEL_SSH_PORT>" curac@<CPANEL_HOST>:public_html/umis/backend/storage/ \
  /srv/cur-mis/backend/shared/storage/
sudo chown -R deploy:www-data /srv/cur-mis/*/shared/storage
sudo chmod -R g+rwX /srv/cur-mis/*/shared/storage
```

Without SSH: cPanel File Manager → compress each folder → download → `scp` to the server → unzip.

---

## 11. Day-2 operations

| Task | Command |
|---|---|
| Roll back backend code | `ssh deploy@<SERVER_IP> /srv/cur-mis/bin/rollback backend` |
| Roll back to a specific release | `… /srv/cur-mis/bin/rollback frontend 20261026120000-ab12cd3` |
| List releases | `ls -lt /srv/cur-mis/backend/releases` |
| Which release is live | `readlink -f /srv/cur-mis/backend/current` |
| App logs | `tail -f /srv/cur-mis/backend/shared/logs/*.log` |
| Nginx errors | `sudo tail -f /var/log/nginx/error.log` |
| PHP-FPM errors | `sudo journalctl -u php8.4-fpm -f` |
| Reload after config change | `sudo nginx -t && sudo systemctl reload nginx` / `sudo systemctl reload php8.4-fpm` |

### Nightly backups (root crontab: `sudo crontab -e`)

```cron
# 01:30 — database dump, keep 14 days
30 1 * * * mysqldump --single-transaction --routines --triggers <DB_NAME> | gzip > /var/backups/curmis-db-$(date +\%F).sql.gz && find /var/backups -name 'curmis-db-*' -mtime +14 -delete
# 02:00 — uploaded documents
0 2 * * * tar -czf /var/backups/curmis-uploads-$(date +\%F).tgz -C /srv/cur-mis file-server/shared/storage backend/shared/storage && find /var/backups -name 'curmis-uploads-*' -mtime +7 -delete
```

Create `/root/.my.cnf` (mode 600) with a `[mysqldump]` user/password so the
dump runs without a prompt. Copy `/var/backups` **off the server** on a schedule
(another host, or object storage). A backup that stays on the same disk doesn't
survive losing that disk.

---

## 12. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `502 Bad Gateway` | PHP-FPM pool down or wrong socket. Check `systemctl status php8.4-fpm` and that `/run/php/curmis.sock` exists. |
| `Configuration Error: Cannot resolve backend root path` | `vendor/` is missing from the release. The composer step failed or `vendor/` was excluded. |
| API returns 404 for every route | Wrong `SCRIPT_NAME`. It must be `/umis/api/index.php` so `Core\Request` strips `/umis/api`. |
| `401` on every authenticated call | `JWT_SECRET` changed (users must log in again), or a proxy in front strips `Authorization`. |
| Uploads fail with 401 | `FILE_SERVER_KEY` differs between the backend and file-server `.env`. |
| Uploads fail with 413 | Raise `client_max_body_size` (Nginx) **and** `upload_max_filesize`/`post_max_size` (PHP). |
| Old code still running after deploy | `activate` didn't reload FPM. Check the sudoers entry with `sudo -n systemctl reload php8.4-fpm` as `deploy`. |
| SPA deep link (e.g. `/umis/students/12`) returns 404 | `try_files … /umis/index.html` missing in the `/umis/` block. |
| Blank page after frontend deploy | Browser cached an old `index.html` or the service worker is stale. Check the `Cache-Control` headers on `/umis/index.html` and `/umis/sw.js`. |
| Live log stream / SSE stalls | Have the PHP endpoint send `X-Accel-Buffering: no`, or add `fastcgi_buffering off;` to `@backend`. |
| Deploy job stuck on *Waiting for a runner* | Runner service down. As `deploy`: `systemctl --user status actions-runner`, then `journalctl --user -u actions-runner -n 50`. Or check Settings → Actions → Runners. |
| Deploy job fails downloading the artifact | Outgoing access to `*.blob.core.windows.net` / `*.actions.githubusercontent.com` blocked. Ask the network team to allow them (§7.2). |
| Fork PR is waiting for approval | Expected (guard §7.1). Read its workflow changes before approving. |
| Admin SSH times out from the VPN | fail2ban banned the address after failed password attempts. As root: `fail2ban-client status sshd`, then `fail2ban-client set sshd unbanip <ip>`. |
