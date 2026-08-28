# ⚠️ GitHub Actions Deployment Setup Required

## Current Status

The GitHub Actions workflow has been triggered and is attempting to deploy, but **it's failing because GitHub Secrets haven't been configured yet**.

### Error Cause

The workflow `.github/workflows/deploy-to-cpanel.yml` is running but cannot complete because these 5 required secrets are missing:

```
❌ CPANEL_HOST
❌ CPANEL_USER
❌ CPANEL_SSH_PORT
❌ CPANEL_SSH_KEY
❌ PRODUCTION_PATH
```

---

## ✅ How to Fix This (5 Steps)

### Step 1: Generate SSH Keys

On your **local machine** (or on a Linux server), run:

```bash
ssh-keygen -t rsa -b 4096 -f deploy_key -N ""
```

This creates two files:
- `deploy_key` (private key - keep SECRET)
- `deploy_key.pub` (public key - add to server)

---

### Step 2: Add Public Key to cPanel Server

SSH into your cPanel server:

```bash
ssh -p 2083 your_cpanel_username@cyimo-whm-private.aos.rw
```

Then add the public key:

```bash
# Create SSH directory
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Add the public key (copy contents of deploy_key.pub)
cat >> ~/.ssh/authorized_keys << 'EOF'
[PASTE CONTENTS OF deploy_key.pub HERE]
EOF

# Set proper permissions
chmod 600 ~/.ssh/authorized_keys
```

Verify git is installed:
```bash
git --version
```

---

### Step 3: Setup Git Repository on Production Server

Still SSH'd into your cPanel server, run:

```bash
# Navigate to your production directory
cd /path/to/your/production/directory

# Initialize git (if not already done)
git init
git remote add origin https://github.com/niyongaboemmy/cur-mis.git
git fetch origin
git checkout main
```

**Important**: Get the exact production path. It should be something like:
- `/home/username/public_html`
- `/var/www/html`
- `/opt/app/production`

Ask your hosting provider if unsure.

---

### Step 4: Add Secrets to GitHub

1. Go to: **https://github.com/niyongaboemmy/cur-mis/settings/secrets/actions**

2. Click **"New repository secret"** and add these 5 secrets:

#### Secret 1: CPANEL_HOST
- **Name**: `CPANEL_HOST`
- **Value**: `cyimo-whm-private.aos.rw`

#### Secret 2: CPANEL_USER
- **Name**: `CPANEL_USER`
- **Value**: Your cPanel username (e.g., `curuser`, `admin`, etc.)

#### Secret 3: CPANEL_SSH_PORT
- **Name**: `CPANEL_SSH_PORT`
- **Value**: `2083`

#### Secret 4: CPANEL_SSH_KEY
- **Name**: `CPANEL_SSH_KEY`
- **Value**: **Entire contents of `deploy_key` file** (including BEGIN and END lines)
  ```
  -----BEGIN RSA PRIVATE KEY-----
  [entire key content]
  -----END RSA PRIVATE KEY-----
  ```

#### Secret 5: PRODUCTION_PATH
- **Name**: `PRODUCTION_PATH`
- **Value**: Exact path to production directory (e.g., `/home/username/public_html`)

---

### Step 5: Trigger Deployment

Once all 5 secrets are added, the next push to `main` will automatically deploy.

To test immediately:

```bash
# Make a test commit
echo "# Deployment test" >> test.txt
git add test.txt
git commit -m "test: trigger deployment workflow"
git push origin main
```

Then watch the deployment:
1. Go to: https://github.com/niyongaboemmy/cur-mis/actions
2. Click the latest workflow run
3. Check "Deploy to cPanel Production" job status

---

## 🔍 Troubleshooting

### "Permission denied (publickey)"
**Solution**:
- Check public key is in `~/.ssh/authorized_keys` on server
- Verify permissions: `chmod 600 ~/.ssh/authorized_keys`
- Ensure CPANEL_SSH_KEY secret contains the **private** key (not public)

### "Repository not found"
**Solution**:
- Verify `.git` directory exists on production server
- Check git remote: `git remote -v`
- Verify git is installed: `git --version`

### "Path not found"
**Solution**:
- Verify PRODUCTION_PATH is correct
- SSH to server and check: `ls -la /path/to/production`
- Ensure directory exists and has proper permissions

### Deployment still failing?
**Solution**:
1. Check GitHub Actions logs for exact error message
2. Verify all 5 secrets are set correctly
3. Test SSH connection manually from your machine:
   ```bash
   ssh -i deploy_key -p 2083 your_username@cyimo-whm-private.aos.rw
   ```
4. Test git pull manually on production server

---

## 📋 Checklist

Before deployment will work, you must complete:

- [ ] Generated SSH keys (`deploy_key` and `deploy_key.pub`)
- [ ] SSH'd into cPanel server
- [ ] Added public key to `~/.ssh/authorized_keys`
- [ ] Verified git is installed on server
- [ ] Initialized git repository in production directory
- [ ] Added all 5 secrets to GitHub repository settings:
  - [ ] CPANEL_HOST = `cyimo-whm-private.aos.rw`
  - [ ] CPANEL_USER = Your username
  - [ ] CPANEL_SSH_PORT = `2083`
  - [ ] CPANEL_SSH_KEY = Private key contents
  - [ ] PRODUCTION_PATH = Your production directory path
- [ ] Tested with a test commit push

---

## 🎯 What Happens After Setup

Once secrets are configured:

1. **You push to main**:
   ```bash
   git push origin main
   ```

2. **GitHub Actions automatically**:
   - Triggers workflow
   - Checks out your code
   - Connects to cPanel via SSH
   - Runs: `git pull origin main`
   - Updates production

3. **Your code is live** in ~10 seconds

4. **No more manual deployments needed!**

---

## 📱 Example: cPanel Access

If you need help finding your details:

1. **cPanel Username**: Check your hosting control panel login
2. **cPanel Host**: `cyimo-whm-private.aos.rw` (as you provided)
3. **SSH Port**: Usually `2083` for cPanel
4. **Production Path**: Ask hosting provider or check in cPanel File Manager

---

## 🔐 Security Reminder

⚠️ **Important**:
- Never commit `deploy_key` to GitHub (it's in .gitignore)
- Private key stays ONLY in GitHub Secrets
- Public key goes ONLY in `~/.ssh/authorized_keys` on server
- Keep deploy_key file secure on your machine

---

## 📞 Need Help?

### Check These Docs
- `GITHUB_DEPLOYMENT_QUICK_START.md` - Quick setup guide
- `DEPLOYMENT_SETUP.md` - Detailed troubleshooting
- `DEPLOYMENT_ARCHITECTURE.md` - How it works

### What to Do Next
1. Complete the 5 steps above
2. Add all secrets to GitHub
3. Push a test commit
4. Watch GitHub Actions succeed
5. Verify code is live on production

---

## ✅ Once Setup is Complete

After you've added all secrets:

1. **Every push to main automatically deploys**
2. **No more manual SSH needed**
3. **Automatic deployment in ~10 seconds**
4. **Production stays up-to-date**
5. **Easy rollback with `git revert`**

---

**Current Status**: ⏳ Waiting for GitHub Secrets configuration  
**When Secrets Added**: ✅ Automatic deployment will work  
**Student Finance Portal Feature**: ✅ Ready to deploy (code is committed)
