# Deployment Quick Reference Card

## One-Time Setup (5 minutes)

```bash
# 1. Generate SSH keys
bash scripts/setup-deployment.sh

# 2. Add to cPanel server's ~/.ssh/authorized_keys
# (copy contents of deploy_key.pub)

# 3. Setup git on production server
cd /path/to/production
git init
git remote add origin https://github.com/niyongaboemmy/cur-mis.git
git fetch origin && git checkout main

# 4. Add 5 secrets to GitHub repository settings
# https://github.com/niyongaboemmy/cur-mis/settings/secrets/actions
CPANEL_HOST=cyimo-whm-private.aos.rw
CPANEL_USER=your_username
CPANEL_SSH_PORT=2083
CPANEL_SSH_KEY=<entire contents of deploy_key file>
PRODUCTION_PATH=/path/to/production
```

## Daily Workflow (After Setup)

```bash
# Make changes, commit, and push
git add .
git commit -m "your message"
git push origin main

# ✨ Automatic deployment happens!
# Code is live in ~10 seconds
```

## Check Deployment Status

1. **GitHub Actions Log:**
   - Go to: https://github.com/niyongaboemmy/cur-mis/actions
   - Click latest workflow run
   - Check "Deploy to cPanel Production" status

2. **Verify on Server:**
   ```bash
   ssh -p 2083 user@cyimo-whm-private.aos.rw
   cd /production/path
   git log --oneline -1
   ```

## Undo Bad Deployment

```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or rollback manually on server:
# git checkout <previous_commit_hash>
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Permission denied" | Check `~/.ssh/authorized_keys` on server, verify key permissions |
| Deployment fails | Check GitHub Actions logs at https://github.com/niyongaboemmy/cur-mis/actions |
| Code not updating | SSH to server, run `git pull origin main` manually, check app logs |
| Timeout | Network issue, server overloaded, or large repo - check logs |
| Can't add secrets | Use GitHub token auth, ensure you're in correct repo settings |

## Files Reference

| File | Purpose |
|------|---------|
| `.github/workflows/deploy-to-cpanel.yml` | Deployment automation (GitHub Actions) |
| `GITHUB_DEPLOYMENT_QUICK_START.md` | Quick setup guide |
| `DEPLOYMENT_SETUP.md` | Detailed setup + troubleshooting |
| `DEPLOYMENT_ARCHITECTURE.md` | System diagrams & how it works |
| `DEPLOYMENT_FAQ.md` | Common questions & scenarios |
| `scripts/setup-deployment.sh` | Automated key generation |

## Key Reminders

⚠️ **Don't commit deploy_key** - it's in .gitignore
🔐 **Keep GitHub account secure** - it controls production
✅ **Test on a small change first** - verify it works
📊 **Monitor first few deployments** - watch for issues
🔑 **Rotate SSH keys periodically** - security best practice

## Commands Cheat Sheet

```bash
# Generate new SSH keys
bash scripts/setup-deployment.sh

# Test SSH connection to server
ssh -i deploy_key -p 2083 user@cyimo-whm-private.aos.rw

# Check recent deployments on server
git log --oneline -10

# Manually trigger deployment (push empty commit)
git commit --allow-empty -m "trigger deployment"
git push origin main

# Add .gitignore changes
git add .gitignore

# View deployment workflow
cat .github/workflows/deploy-to-cpanel.yml

# Check if git is on production server
ssh -p 2083 user@cyimo-whm-private.aos.rw "git --version"
```

## Deployment Pipeline

```
Local Git Push
    ↓ (HTTPS to GitHub)
GitHub Repository
    ↓ (Webhook trigger)
GitHub Actions
    ↓ (SSH on port 2083)
cPanel Server (cyimo-whm-private.aos.rw)
    ↓ (git pull)
Production Directory
    ↓
Live Application
    ↓
Users See Changes
```

**Total time: ~10 seconds**

## Next Steps

1. If **new to this setup**: Read `GITHUB_DEPLOYMENT_QUICK_START.md`
2. If **troubleshooting**: Check `DEPLOYMENT_FAQ.md`
3. If **understanding system**: Review `DEPLOYMENT_ARCHITECTURE.md`
4. If **in-depth setup**: See `DEPLOYMENT_SETUP.md`

---

**Everything is automated.** After setup:
- Every push to `main` auto-deploys
- No manual server SSH needed
- Status visible in GitHub Actions
- Instant rollback available via `git revert`
