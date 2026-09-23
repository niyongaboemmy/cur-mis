#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-from-local.sh — deploy frontend and/or backend to cPanel from a
# machine that can actually reach cpanel.cur.ac.rw:2083.
#
# WHY THIS EXISTS
# The GitHub Actions deploy workflows fail with curl exit 28: the server's
# firewall never completes a TCP/TLS connection from GitHub's runner IPs
# (every runner-side build step passes; only the cPanel upload dies). From an
# allowed network — e.g. the machine you use for phpMyAdmin — the same upload
# works. This script replicates the workflows' upload steps exactly
# (.github/workflows/deploy-frontend.yml / deploy-backend.yml), including the
# stage-then-swap extractor helpers and the OPcache flush loop.
#
# USAGE
#   CPANEL_PASS='...' ./deploy-from-local.sh              # frontend + backend
#   CPANEL_PASS='...' ./deploy-from-local.sh frontend
#   CPANEL_PASS='...' ./deploy-from-local.sh backend
#   CPANEL_PASS='...' ./deploy-from-local.sh backend --vendor   # also redeploy vendor/
#
# Ships code only — never touches the database, never overwrites the server's
# .env or .htaccess (same exclusions as the workflows).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CPANEL_URL="${CPANEL_URL:-https://cpanel.cur.ac.rw:2083}"
CPANEL_USER="${CPANEL_USER:-curac}"
SITE_BASE="https://cur.ac.rw/umis"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

TARGET="${1:-all}"
WITH_VENDOR=0
[[ "${2:-}" == "--vendor" || "${1:-}" == "--vendor" ]] && WITH_VENDOR=1

if [[ -z "${CPANEL_PASS:-}" ]]; then
  echo "ERROR: set CPANEL_PASS in the environment first:"
  echo "  CPANEL_PASS='your cPanel password' $0 [frontend|backend|all]"
  exit 1
fi

# Extractor helpers — identical to the workflows' embedded base64 blobs.
# Placeholders replaced per use: DEPLOY_TOKEN, DEPLOY_ZIP_NAME, DEPLOY_OFFSET,
# DEPLOY_DEST_DIR, FLUSH_TOKEN.
EXTRACTOR_INPLACE_B64='PD9waHAKaWYgKCgkX0dFVFsndG9rZW4nXSA/PyAnJykgIT09ICdERVBMT1lfVE9LRU4nKSB7IGh0dHBfcmVzcG9uc2VfY29kZSg0MDMpOyBkaWUoJ2ZvcmJpZGRlbicpOyB9CiR6aXAgPSBfX0RJUl9fIC4gJy9ERVBMT1lfWklQX05BTUUnOwokc3RhZ2luZyA9IF9fRElSX18gLiAnL19kc18nIC4gdGltZSgpOwokeiA9IG5ldyBaaXBBcmNoaXZlOwppZiAoJHotPm9wZW4oJHppcCkgIT09IFRSVUUpIHsgaHR0cF9yZXNwb25zZV9jb2RlKDUwMCk7IGVjaG8gJ2ZhaWxlZDogJy4kei0+Z2V0U3RhdHVzU3RyaW5nKCk7IGV4aXQ7IH0KaWYgKCFta2Rpcigkc3RhZ2luZywgMDc1NSwgdHJ1ZSkpIHsgaHR0cF9yZXNwb25zZV9jb2RlKDUwMCk7IGVjaG8gJ2ZhaWxlZDogc3RhZ2luZyc7IGV4aXQ7IH0KJHotPmV4dHJhY3RUbygkc3RhZ2luZyk7ICR6LT5jbG9zZSgpOyB1bmxpbmsoJHppcCk7CiRpdCA9IG5ldyBSZWN1cnNpdmVJdGVyYXRvckl0ZXJhdG9yKG5ldyBSZWN1cnNpdmVEaXJlY3RvcnlJdGVyYXRvcigkc3RhZ2luZywgUmVjdXJzaXZlRGlyZWN0b3J5SXRlcmF0b3I6OlNLSVBfRE9UUyksIFJlY3Vyc2l2ZUl0ZXJhdG9ySXRlcmF0b3I6OlNFTEZfRklSU1QpOwpmb3JlYWNoICgkaXQgYXMgJGYpIHsgJHJlbCA9IHN1YnN0cigkZi0+Z2V0UGF0aG5hbWUoKSwgc3RybGVuKCRzdGFnaW5nKSsxKTsgJGQgPSBfX0RJUl9fLicvJy4kcmVsOyBpZiAoJGYtPmlzRGlyKCkpIHsgaWYgKCFpc19kaXIoJGQpKSBta2RpcigkZCwwNzU1LHRydWUpOyB9IGVsc2UgeyAkZGQgPSBkaXJuYW1lKCRkKTsgaWYgKCFpc19kaXIoJGRkKSkgbWtkaXIoJGRkLDA3NTUsdHJ1ZSk7IHJlbmFtZSgkZi0+Z2V0UGF0aG5hbWUoKSwkZCk7IH0gfQokY2wgPSBuZXcgUmVjdXJzaXZlSXRlcmF0b3JJdGVyYXRvcihuZXcgUmVjdXJzaXZlRGlyZWN0b3J5SXRlcmF0b3IoJHN0YWdpbmcsIFJlY3Vyc2l2ZURpcmVjdG9yeUl0ZXJhdG9yOjpTS0lQX0RPVFMpLCBSZWN1cnNpdmVJdGVyYXRvckl0ZXJhdG9yOjpDSElMRF9GSVJTVCk7CmZvcmVhY2ggKCRjbCBhcyAkZikgeyAkZi0+aXNEaXIoKSA/IHJtZGlyKCRmLT5nZXRQYXRobmFtZSgpKSA6IHVubGluaygkZi0+Z2V0UGF0aG5hbWUoKSk7IH0KQHJtZGlyKCRzdGFnaW5nKTsKaWYgKGZ1bmN0aW9uX2V4aXN0cygnb3BjYWNoZV9yZXNldCcpKSBvcGNhY2hlX3Jlc2V0KCk7CnVubGluayhfX0ZJTEVfXyk7IGVjaG8gJ29rJzsK'
EXTRACTOR_HOME_B64='PD9waHAKaWYgKCgkX0dFVFsndG9rZW4nXSA/PyAnJykgIT09ICdERVBMT1lfVE9LRU4nKSB7IGh0dHBfcmVzcG9uc2VfY29kZSg0MDMpOyBkaWUoJ2ZvcmJpZGRlbicpOyB9CiRob21lID0gcmVhbHBhdGgoX19ESVJfXyAuICcvREVQTE9ZX09GRlNFVCcpOwokemlwID0gJGhvbWUgLiAnL0RFUExPWV9aSVBfTkFNRSc7CiRkZXN0ID0gJGhvbWUgLiAnL0RFUExPWV9ERVNUX0RJUic7CiRzdGFnaW5nID0gJGhvbWUgLiAnL19kc18nIC4gdGltZSgpOwokeiA9IG5ldyBaaXBBcmNoaXZlOwppZiAoJHotPm9wZW4oJHppcCkgIT09IFRSVUUpIHsgaHR0cF9yZXNwb25zZV9jb2RlKDUwMCk7IGVjaG8gJ2ZhaWxlZDogJy4kei0+Z2V0U3RhdHVzU3RyaW5nKCk7IGV4aXQ7IH0KaWYgKCFpc19kaXIoJGRlc3QpKSBta2RpcigkZGVzdCwgMDc1NSwgdHJ1ZSk7CmlmICghbWtkaXIoJHN0YWdpbmcsIDA3NTUsIHRydWUpKSB7IGh0dHBfcmVzcG9uc2VfY29kZSg1MDApOyBlY2hvICdmYWlsZWQ6IHN0YWdpbmcnOyBleGl0OyB9CiR6LT5leHRyYWN0VG8oJHN0YWdpbmcpOyAkei0+Y2xvc2UoKTsgdW5saW5rKCR6aXApOwokaXQgPSBuZXcgUmVjdXJzaXZlSXRlcmF0b3JJdGVyYXRvcihuZXcgUmVjdXJzaXZlRGlyZWN0b3J5SXRlcmF0b3IoJHN0YWdpbmcsIFJlY3Vyc2l2ZURpcmVjdG9yeUl0ZXJhdG9yOjpTS0lQX0RPVFMpLCBSZWN1cnNpdmVJdGVyYXRvckl0ZXJhdG9yOjpTRUxGX0ZJUlNUKTsKZm9yZWFjaCAoJGl0IGFzICRmKSB7ICRyZWwgPSBzdWJzdHIoJGYtPmdldFBhdGhuYW1lKCksIHN0cmxlbigkc3RhZ2luZykrMSk7ICRkID0gJGRlc3QuJy8nLiRyZWw7IGlmICgkZi0+aXNEaXIoKSkgeyBpZiAoIWlzX2RpcigkZCkpIG1rZGlyKCRkLDA3NTUsdHJ1ZSk7IH0gZWxzZSB7ICRkZCA9IGRpcm5hbWUoJGQpOyBpZiAoIWlzX2RpcigkZGQpKSBta2RpcigkZGQsMDc1NSx0cnVlKTsgcmVuYW1lKCRmLT5nZXRQYXRobmFtZSgpLCRkKTsgfSB9CiRjbCA9IG5ldyBSZWN1cnNpdmVJdGVyYXRvckl0ZXJhdG9yKG5ldyBSZWN1cnNpdmVEaXJlY3RvcnlJdGVyYXRvcigkc3RhZ2luZywgUmVjdXJzaXZlRGlyZWN0b3J5SXRlcmF0b3I6OlNLSVBfRE9UUyksIFJlY3Vyc2l2ZUl0ZXJhdG9ySXRlcmF0b3I6OkNISUxEX0ZJUlNUKTsKZm9yZWFjaCAoJGNsIGFzICRmKSB7ICRmLT5pc0RpcigpID8gcm1kaXIoJGYtPmdldFBhdGhuYW1lKCkpIDogdW5saW5rKCRmLT5nZXRQYXRobmFtZSgpKTsgfQpAcm1kaXIoJHN0YWdpbmcpOwppZiAoZnVuY3Rpb25fZXhpc3RzKCdvcGNhY2hlX3Jlc2V0JykpIG9wY2FjaGVfcmVzZXQoKTsKdW5saW5rKF9fRklMRV9fKTsgZWNobyAnb2snOwo='
FLUSH_OPCACHE_B64='PD9waHAKaWYgKCgkX0dFVFsidG9rZW4iXSA/PyAiIikgIT09ICJGTFVTSF9UT0tFTiIpIHsgaHR0cF9yZXNwb25zZV9jb2RlKDQwMyk7IGRpZSgiZm9yYmlkZGVuIik7IH0KaWYgKGZ1bmN0aW9uX2V4aXN0cygib3BjYWNoZV9yZXNldCIpKSB7CiAgICBvcGNhY2hlX3Jlc2V0KCk7CiAgICBpZiAoIWVtcHR5KCRfR0VUWyJsYXN0Il0pKSB7IHVubGluayhfX0ZJTEVfXyk7IH0KICAgIGVjaG8gIm9rIjsKfSBlbHNlIHsKICAgIGlmICghZW1wdHkoJF9HRVRbImxhc3QiXSkpIHsgdW5saW5rKF9fRklMRV9fKTsgfQogICAgZWNobyAibm8tb3BjYWNoZSI7Cn0K'

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

say() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

# upload <local-file> <remote-dir> — cPanel UAPI upload, dies on failure.
upload() {
  local file="$1" dir="$2" r
  r=$(curl -s -k --connect-timeout 20 --max-time 300 -u "$CPANEL_USER:$CPANEL_PASS" \
    -F "dir=$dir" -F "overwrite=1" \
    -F "file-1=@$file" \
    "$CPANEL_URL/execute/Fileman/upload_files")
  echo "  upload $(basename "$file") → $dir: $(echo "$r" | jq -c '{status, errors}' 2>/dev/null || echo "$r")"
  [ "$(echo "$r" | jq -r '.status // 0')" = "1" ] || { echo "UPLOAD FAILED"; exit 1; }
}

# run_extractor <helper-file-name> <url-path> <token>
run_extractor() {
  local name="$1" url="$2" token="$3" result
  result=$(curl -s -k --connect-timeout 20 --max-time 120 "$url/$name?token=$token")
  echo "  extract: $result"
  [ "$result" = "ok" ] || { echo "EXTRACTION FAILED: $result"; exit 1; }
}

deploy_frontend() {
  say "FRONTEND: build"
  cd "$REPO_ROOT/frontend"
  npm ci
  npm run type-check
  NODE_ENV=production npm run build
  say "FRONTEND: package"
  ( cd dist && zip -qr "$WORK/frontend-deploy.zip" . -x '*/.DS_Store' -x '*/__MACOSX*' )
  du -sh "$WORK/frontend-deploy.zip"

  say "FRONTEND: upload & extract → public_html/umis/"
  local token; token=$(openssl rand -hex 16)
  echo "$EXTRACTOR_INPLACE_B64" | base64 -d \
    | sed -e "s/DEPLOY_TOKEN/$token/" -e "s/DEPLOY_ZIP_NAME/frontend-deploy.zip/" \
    > "$WORK/_extract.php"
  upload "$WORK/frontend-deploy.zip" "/public_html/umis"
  upload "$WORK/_extract.php" "/public_html/umis"
  run_extractor "_extract.php" "$SITE_BASE" "$token"
  echo "Frontend deployed: $SITE_BASE/"
}

deploy_backend() {
  cd "$REPO_ROOT"

  if [[ $WITH_VENDOR -eq 1 ]]; then
    say "BACKEND: composer install (vendor redeploy requested)"
    ( cd backend && composer install --no-dev --optimize-autoloader --no-interaction )
    say "BACKEND: package vendor/"
    ( cd backend && zip -qr "$WORK/backend-vendor.zip" vendor/ -x './__MACOSX*' -x './.DS_Store' )
    du -sh "$WORK/backend-vendor.zip"

    say "BACKEND: upload & extract vendor/ → public_html/umis/backend/vendor/"
    local vtoken; vtoken=$(openssl rand -hex 16)
    echo "$EXTRACTOR_HOME_B64" | base64 -d \
      | sed -e "s/DEPLOY_TOKEN/$vtoken/" -e "s|DEPLOY_OFFSET|/..|" \
            -e "s/DEPLOY_ZIP_NAME/backend-vendor.zip/" -e "s/DEPLOY_DEST_DIR/backend/" \
      > "$WORK/_extract_vendor.php"
    upload "$WORK/backend-vendor.zip" "/public_html/umis"
    upload "$WORK/_extract_vendor.php" "/public_html/umis/api"
    run_extractor "_extract_vendor.php" "$SITE_BASE/api" "$vtoken"
  fi

  say "BACKEND: package source (no vendor/, no .env, no .htaccess)"
  ( cd backend && zip -qr "$WORK/backend-src.zip" . \
      -x './vendor/*' -x './vendor/**' \
      -x './public/*' -x './public/**' \
      -x './docs/*'   -x './docs/**' \
      -x './.env' -x './*.phar' -x './.htaccess' \
      -x './test_*.php' -x './logs/*.log' \
      -x './__MACOSX*' -x './.DS_Store' )
  du -sh "$WORK/backend-src.zip"

  say "BACKEND: upload & extract source → public_html/umis/backend/"
  local stoken; stoken=$(openssl rand -hex 16)
  echo "$EXTRACTOR_HOME_B64" | base64 -d \
    | sed -e "s/DEPLOY_TOKEN/$stoken/" -e "s|DEPLOY_OFFSET|/..|" \
          -e "s/DEPLOY_ZIP_NAME/backend-src.zip/" -e "s/DEPLOY_DEST_DIR/backend/" \
    > "$WORK/_extract_src.php"
  upload "$WORK/backend-src.zip" "/public_html/umis"
  upload "$WORK/_extract_src.php" "/public_html/umis/api"
  run_extractor "_extract_src.php" "$SITE_BASE/api" "$stoken"

  say "BACKEND: package & deploy public/ entry point → public_html/umis/api/"
  ( cd backend/public && zip -qr "$WORK/backend-public.zip" . -x './__MACOSX*' -x './.DS_Store' )
  local ptoken; ptoken=$(openssl rand -hex 16)
  echo "$EXTRACTOR_INPLACE_B64" | base64 -d \
    | sed -e "s/DEPLOY_TOKEN/$ptoken/" -e "s/DEPLOY_ZIP_NAME/backend-public.zip/" \
    > "$WORK/_extract_pub.php"
  upload "$WORK/backend-public.zip" "/public_html/umis/api"
  upload "$WORK/_extract_pub.php" "/public_html/umis/api"
  run_extractor "_extract_pub.php" "$SITE_BASE/api" "$ptoken"

  say "BACKEND: flush OPcache across FPM workers"
  local ftoken; ftoken=$(openssl rand -hex 16)
  echo "$FLUSH_OPCACHE_B64" | base64 -d | sed "s/FLUSH_TOKEN/$ftoken/" > "$WORK/_flush_opcache.php"
  upload "$WORK/_flush_opcache.php" "/public_html/umis/api"
  sleep 1
  for i in $(seq 1 19); do
    printf '  flush #%s: %s\n' "$i" \
      "$(curl -s -k --max-time 15 "$SITE_BASE/api/_flush_opcache.php?token=$ftoken")"
  done
  printf '  flush #20 (self-delete): %s\n' \
    "$(curl -s -k --max-time 15 "$SITE_BASE/api/_flush_opcache.php?token=$ftoken&last=1")"
  echo "Backend deployed: $SITE_BASE/api/"
}

case "$TARGET" in
  frontend)        deploy_frontend ;;
  backend)         deploy_backend ;;
  all|--vendor|"") deploy_frontend; deploy_backend ;;
  *) echo "Unknown target '$TARGET' — use frontend | backend | all"; exit 1 ;;
esac

say "DONE"
