# Automatic GitHub to cPanel Deployment Setup

This document explains how to configure automatic deployment of your CUR-MIS application from GitHub to your cPanel production server.

## Overview

Every time you push to the `main` branch on GitHub, the following happens automatically:
1. GitHub Actions workflow is triggered
2. Code is pulled from GitHub to your production server via SSH
3. Deployment status is reported back to GitHub

## Prerequisites

You need:
- SSH access to your cPanel server
- A deploy key (SSH key pair) for GitHub to authenticate with your server
- Access to GitHub repository settings to add secrets
- Root or appropriate user permissions on cPanel server

## Step 1: Generate SSH Deploy Key Pair

Run these commands on your **local machine**:

```bash
# Generate SSH key pair (leave passphrase empty for automation)
ssh-keygen -t rsa -b 4096 -f deploy_key -N ""

# This creates two files:
# - deploy_key (private key - keep this secret)
# - deploy_key.pub (public key - add to server)
```

## Step 2: Add Public Key to cPanel Server

1. **SSH into your cPanel server:**
   ```bash
   ssh -p 2083 your_cpanel_user@cyimo-whm-private.aos.rw
   ```

2. **Add the deploy key to authorized_keys:**
   ```bash
   # Navigate to home directory
   cd ~

   # Create .ssh directory if it doesn't exist
   mkdir -p ~/.ssh
   chmod 700 ~/.ssh

   # Add the public key
   cat >> ~/.ssh/authorized_keys << 'EOF'
   <PASTE_CONTENTS_OF_deploy_key.pub_HERE>
   EOF

   # Set proper permissions
   chmod 600 ~/.ssh/authorized_keys
   ```

3. **Verify git is installed on the server:**
   ```bash
   git --version
   ```

## Step 3: Setup Git Repository on cPanel Server

1. **SSH into your cPanel server:**
   ```bash
   ssh -p 2083 your_cpanel_user@cyimo-whm-private.aos.rw
   ```

2. **Navigate to your production directory and initialize git:**
   ```bash
   # Replace /path/to/production with your actual production path
   cd /path/to/production

   # Check if .git already exists
   ls -la | grep git

   # If not, initialize or clone the repository
   # Option A: If directory is empty
   git clone https://github.com/niyongaboemmy/cur-mis.git .

   # Option B: If files already exist (convert to git repo)
   git init
   git remote add origin https://github.com/niyongaboemmy/cur-mis.git
   git fetch origin
   git checkout main
   ```

3. **Verify you can pull from GitHub:**
   ```bash
   git pull origin main
   ```

## Step 4: Add GitHub Secrets

1. **Go to GitHub repository settings:**
   - Navigate to: https://github.com/niyongaboemmy/cur-mis/settings/secrets/actions

2. **Add the following secrets:**

   | Secret Name | Value |
   |------------|-------|
   | `CPANEL_HOST` | `cyimo-whm-private.aos.rw` |
   | `CPANEL_USER` | Your cPanel username |
   | `CPANEL_SSH_PORT` | `2083` |
   | `CPANEL_SSH_KEY` | Contents of `deploy_key` (private key file) |
   | `PRODUCTION_PATH` | `/path/to/your/production/directory` |

   **Steps to add each secret:**
   - Click "New repository secret"
   - Enter the name (e.g., `CPANEL_HOST`)
   - Paste the value
   - Click "Add secret"

   For `CPANEL_SSH_KEY`, paste the **entire contents** of the `deploy_key` file (including BEGIN/END lines).

## Step 5: Test the Deployment

1. **Make a test change:**
   ```bash
   echo "# Test deployment" >> README.md
   git add README.md
   git commit -m "test: trigger deployment workflow"
   git push origin main
   ```

2. **Check GitHub Actions:**
   - Go to: https://github.com/niyongaboemmy/cur-mis/actions
   - Click the workflow run for your commit
   - Check the "Deploy to cPanel Production" job for success/failure

3. **Verify on production server:**
   ```bash
   ssh -p 2083 your_cpanel_user@cyimo-whm-private.aos.rw
   cd /path/to/production
   git log --oneline -1
   ```

## Step 6: Handle Application-Specific Deployment Tasks

If your application needs additional steps during deployment (clearing caches, running migrations, restarting services), add them to the deployment script.

**Edit `.github/workflows/deploy-to-cpanel.yml`** and add steps in the SSH command section:

```bash
cd $PRODUCTION_PATH
git pull origin main

# Add custom deployment tasks here:
# php artisan migrate --force
# php artisan cache:clear
# composer install --no-dev --optimize-autoloader
# systemctl restart your_service
```

## Troubleshooting

### "Permission denied (publickey)" error
- Verify public key is in `~/.ssh/authorized_keys` on server
- Check file permissions: `chmod 600 ~/.ssh/authorized_keys`
- Verify SSH port 2083 is correct for your server

### "Repository not found" error
- Ensure `.git` directory exists on production server
- Verify remote is set: `git remote -v`
- Check you have SSH access to GitHub

### Deployment status not updating
- Check GitHub Actions logs for errors
- Verify all secrets are set correctly in repository settings
- Ensure CPANEL_SSH_KEY is the private key (not public)

### Application not reflecting changes
- Check if application caches need clearing
- Verify file permissions on production server
- Check application logs for errors
- May need to restart PHP/web server

## Security Best Practices

1. **SSH Key Security:**
   - Keep `deploy_key` private - never commit it
   - Rotate keys periodically
   - Consider using SSH key with specific restrictions if possible

2. **GitHub Secrets:**
   - Secrets are encrypted and only visible to authorized users
   - They're not exposed in logs or output
   - Rotate deploy keys if you suspect compromise

3. **Production Access:**
   - Use a dedicated deploy user account (not root)
   - Restrict SSH key to specific commands if possible
   - Monitor deployment activity in GitHub Actions logs

## Rollback Procedure

If a deployment causes issues:

```bash
# SSH to production server
ssh -p 2083 your_cpanel_user@cyimo-whm-private.aos.rw

# Navigate to production directory
cd /path/to/production

# Check recent commits
git log --oneline -5

# Revert to previous commit
git revert HEAD

# Or manually checkout a specific commit
git checkout <commit_hash>

# Push the revert
git push origin main
```

## Next Steps

1. Complete Steps 1-4 above
2. Test deployment with a small change
3. Monitor the first few deployments
4. Add any application-specific deployment tasks
5. Set up monitoring and alerts (optional)

---

For questions or issues, check the GitHub Actions logs at:
https://github.com/niyongaboemmy/cur-mis/actions
