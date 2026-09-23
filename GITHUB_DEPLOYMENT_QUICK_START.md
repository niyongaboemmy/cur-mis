# GitHub to cPanel Auto-Deployment: Quick Start

## What This Does

Every time you push to `main` branch:
1. GitHub Actions automatically runs
2. Your code is deployed to cPanel production server via SSH
3. Status is reported back to GitHub

## 5-Minute Setup

### Step 1: Generate Deploy Keys
```bash
# Run from your local machine in the project directory
bash scripts/setup-deployment.sh
```

This creates:
- `deploy_key` (private key - for GitHub secrets)
- `deploy_key.pub` (public key - for cPanel server)

### Step 2: Add Public Key to cPanel Server

SSH into your server:
```bash
ssh -p 2083 your_username@cyimo-whm-private.aos.rw
```

Add the public key:
```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
cat >> ~/.ssh/authorized_keys << 'EOF'
# Paste contents of deploy_key.pub here
EOF
chmod 600 ~/.ssh/authorized_keys
```

Verify git is installed:
```bash
git --version
```

### Step 3: Setup Git on Production Server

Still SSH'd into your server:
```bash
# Navigate to your production directory
cd /path/to/your/production

# Initialize git repo if needed
git init
git remote add origin https://github.com/niyongaboemmy/cur-mis.git
git fetch origin
git checkout main
```

### Step 4: Add GitHub Secrets

Visit: https://github.com/niyongaboemmy/cur-mis/settings/secrets/actions

Add these 5 secrets by clicking "New repository secret":

| Name | Value |
|------|-------|
| CPANEL_HOST | `cyimo-whm-private.aos.rw` |
| CPANEL_USER | Your cPanel username |
| CPANEL_SSH_PORT | `2083` |
| CPANEL_SSH_KEY | Entire contents of `deploy_key` file |
| PRODUCTION_PATH | `/path/to/your/production` |

**Important:** For CPANEL_SSH_KEY, copy the entire private key file including BEGIN/END lines.

### Step 5: Test It

Make a test commit:
```bash
echo "test" >> test.txt
git add test.txt
git commit -m "test: deploy workflow"
git push origin main
```

Check deployment status:
- Go to https://github.com/niyongaboemmy/cur-mis/actions
- Click the latest workflow run
- Check the "Deploy to cPanel Production" job

## What Happens on Each Push to `main`

```
Your Push to main
        ↓
GitHub Actions Triggered
        ↓
SSH into cPanel Server
        ↓
Git Pull Latest Code
        ↓
Deployment Complete
```

## Important Files Created

- `.github/workflows/deploy-to-cpanel.yml` - Deployment workflow
- `DEPLOYMENT_SETUP.md` - Detailed setup guide (troubleshooting, security)
- `scripts/setup-deployment.sh` - Automated setup script

## Security Notes

⚠️ **Important:**
- Never commit `deploy_key` to GitHub (it's in .gitignore by default)
- The private key is stored securely in GitHub Secrets
- Only you (and your organization) can see the secrets
- SSH keys are encrypted in transit

## Troubleshooting

**"Permission denied" when deploying?**
- Check public key is in `~/.ssh/authorized_keys` on server
- Verify permissions: `chmod 600 ~/.ssh/authorized_keys`

**GitHub Actions showing errors?**
- Check workflow logs at https://github.com/niyongaboemmy/cur-mis/actions
- Verify all 5 secrets are set correctly
- Ensure PRODUCTION_PATH exists on server

**Code not updating on server?**
- SSH to server and run: `cd /production/path && git pull origin main`
- Check if file permissions block updates
- Look at GitHub Actions logs for errors

## Additional Steps (Optional)

### Clear Application Caches on Deploy

Edit `.github/workflows/deploy-to-cpanel.yml` and add to the SSH command:

```bash
# After: git pull origin main
cd $PRODUCTION_PATH
php artisan cache:clear  # if using Laravel
php artisan config:clear
php artisan view:clear
```

### Restart Web Services

Add to the deployment script:
```bash
# Restart PHP-FPM or Apache
systemctl restart apache2  # or php-fpm
```

### Slack Notifications (Optional)

See `.github/workflows/deploy-to-cpanel.yml` to add Slack webhook notifications.

## Undoing a Bad Deployment

If something went wrong:

```bash
# SSH to production
ssh -p 2083 your_username@cyimo-whm-private.aos.rw
cd /path/to/production

# Go back to previous commit
git revert HEAD
git push origin main
```

This will trigger a new deployment with the reverted code.

---

**Questions?** Check `DEPLOYMENT_SETUP.md` for detailed troubleshooting and configuration options.
