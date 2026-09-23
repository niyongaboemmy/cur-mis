# Deployment Architecture: GitHub to cPanel

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR LOCAL MACHINE                          │
│                                                                 │
│  You push code to main branch                                   │
│  $ git push origin main                                         │
│                                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GITHUB REPOSITORY                            │
│                 niyongaboemmy/cur-mis                           │
│                                                                 │
│  Webhook Trigger (main branch push)                             │
│         ↓                                                       │
│  GitHub Actions Workflow                                        │
│  (.github/workflows/deploy-to-cpanel.yml)                       │
│                                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    Deploy Job Starts
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
    Checkout Code    Load Secrets         Setup SSH
    from GitHub      from GitHub          Known Hosts
                     Secrets Store
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                             ▼
         ┌─────────────────────────────────────┐
         │  SSH into cPanel Server             │
         │  Host: cyimo-whm-private.aos.rw     │
         │  Port: 2083                         │
         │  User: [your cPanel username]       │
         │  Key: CPANEL_SSH_KEY (private key)  │
         └────────────────┬────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────┐
         │  cPanel Production Server           │
         │  (cyimo-whm-private.aos.rw:2083)    │
         │                                     │
         │  cd $PRODUCTION_PATH                │
         │  git fetch origin main              │
         │  git checkout main                  │
         │  git pull origin main               │
         │                                     │
         │  [Custom deployment steps here]     │
         └────────────────┬────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────┐
         │  Production Deployment Complete     │
         │  Code is now live!                  │
         └─────────────────────────────────────┘
```

## Component Breakdown

### 1. Local Development
- You work on the code locally
- When ready, commit and push to `main` branch
- Push triggers the GitHub Actions workflow

### 2. GitHub Actions
- **Trigger:** Any push to `main` branch
- **Workflow:** `.github/workflows/deploy-to-cpanel.yml`
- **Steps:**
  1. Checkout code from GitHub
  2. Load SSH credentials from GitHub Secrets
  3. Connect to cPanel server via SSH
  4. Pull latest code from GitHub
  5. Optional: Run deployment tasks (cache clear, migrations, etc.)
  6. Report status

### 3. cPanel Server
- Receives SSH connection from GitHub Actions
- Pulls latest code using git
- Applies updates to production directory
- (Optional) Runs application-specific tasks

### 4. Production Environment
- Files updated in place
- Application serves updated code
- Users see changes immediately

## Security Flow

```
GitHub Secrets Store (Encrypted)
    │
    ├─ CPANEL_HOST: cyimo-whm-private.aos.rw
    ├─ CPANEL_USER: your_username
    ├─ CPANEL_SSH_PORT: 2083
    ├─ CPANEL_SSH_KEY: [encrypted SSH private key]
    └─ PRODUCTION_PATH: /path/to/production
         │
         │ (Secrets injected into GitHub Actions job)
         ▼
GitHub Actions Runner
    │
    ├─ SSH key written to temporary file
    ├─ SSH connection established
    ├─ Commands executed on server
    └─ SSH key deleted (cleanup)
         │
         ▼
cPanel Server
    │
    ├─ Validates SSH key against authorized_keys
    ├─ Executes deployment commands
    └─ Logs deployment activity
```

## Key Security Properties

✅ **Private Key Never Exposed:**
- Stored encrypted in GitHub Secrets
- Only accessible to the workflow
- Deleted after deployment

✅ **SSH Authentication:**
- Public key cryptography (RSA 4096-bit)
- No password transmission
- Secure key-based authentication

✅ **Secure Connection:**
- TLS encrypted GitHub API calls
- SSH encrypted server connection
- All data encrypted in transit

✅ **Access Control:**
- Only authorized repository members can trigger
- Secrets visible only to repository collaborators
- Deployment activity logged in GitHub

## Data Flow Summary

```
1. Developer Push
   Local → GitHub (HTTPS)

2. Webhook Trigger
   GitHub → GitHub Actions (Internal)

3. Deployment Execution
   GitHub Actions → cPanel (SSH over Port 2083)

4. Code Update
   Git Pull from GitHub → Production Server

5. Live Application
   User Browser → Updated Production Code
```

## Failure Scenarios & Recovery

### Scenario 1: Bad Code Deployed
```
Problem: Latest commit breaks production
Solution: 
  - Revert commit: git revert HEAD
  - Push to main: git push origin main
  - New deployment triggered automatically
  - Production reverted
```

### Scenario 2: Deployment Fails
```
Problem: SSH connection fails, git pull times out, etc.
Solution:
  - Check GitHub Actions logs for error
  - Verify SSH credentials in GitHub Secrets
  - Verify production server is accessible
  - Manually SSH and verify git repo
  - Retry by pushing an empty commit or re-running workflow
```

### Scenario 3: Port/Host Changed
```
Problem: cPanel server changes port or hostname
Solution:
  - Update GitHub Secrets with new values
  - CPANEL_HOST and CPANEL_SSH_PORT
  - Next push will use new credentials
```

## Deployment Timeline

```
T+0s   Developer pushes to main
       └─ git push origin main

T+1s   GitHub receives push event
       └─ Webhook triggers GitHub Actions

T+2s   GitHub Actions job starts
       └─ Runner allocated, checkout starts

T+5s   Secrets loaded, SSH configured
       └─ Ready to connect to server

T+6s   SSH connection established to cPanel
       └─ Authentication succeeds

T+7s   Deployment commands execute
       ├─ git fetch origin main
       ├─ git checkout main  
       └─ git pull origin main

T+10s  Deployment complete
       └─ Production updated

T+11s  Users see changes live
```

**Total time:** ~10 seconds from push to live production

## Customization Points

### Adding Post-Deployment Tasks

Edit `.github/workflows/deploy-to-cpanel.yml`:

```bash
# Example: Clear caches
php artisan cache:clear
php artisan config:clear

# Example: Run migrations
php artisan migrate --force

# Example: Restart services
systemctl restart apache2
systemctl restart php-fpm

# Example: Restart Node.js app
pm2 restart app-name
```

### Conditional Deployments

Only deploy specific branches:
```yaml
on:
  push:
    branches:
      - main
      - production
```

Only deploy on specific file changes:
```yaml
on:
  push:
    branches:
      - main
    paths:
      - 'backend/**'
      - '.github/workflows/**'
```

### Notifications

Add to workflow for status notifications:
```yaml
- name: Notify on Slack
  if: always()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
```

## Monitoring & Logging

### GitHub Actions Logs
- View at: https://github.com/niyongaboemmy/cur-mis/actions
- Shows all deployment attempts
- Displays deployment status (success/failure)
- SSH output and any errors

### Server-Side Logs
SSH to server and check:
```bash
# Git pull status
cd /production/path
git log --oneline -5

# Check git state
git status

# View git remotes
git remote -v

# Check deploy key permissions
ls -la ~/.ssh/authorized_keys
```

### Production Verification
After deployment, verify changes are live:
```bash
ssh -p 2083 user@cyimo-whm-private.aos.rw
cd /production/path
git log --oneline -1
# Compare with latest commit on main
```

---

## Related Documentation

- `GITHUB_DEPLOYMENT_QUICK_START.md` - Quick setup guide (5 minutes)
- `DEPLOYMENT_SETUP.md` - Detailed setup instructions and troubleshooting
- `.github/workflows/deploy-to-cpanel.yml` - Workflow configuration
- `scripts/setup-deployment.sh` - Automated setup script
