# Deployment FAQ & Common Scenarios

## Setup Questions

### Q: Do I need to generate a new SSH key every time?
**A:** No. Generate once with `bash scripts/setup-deployment.sh`, then use those keys for all deployments. They're stable and reusable.

### Q: What if I lose the deploy_key file?
**A:** Generate a new pair and update the CPANEL_SSH_KEY secret in GitHub. Old key becomes invalid. No problem.

### Q: Can multiple people push to main and deploy?
**A:** Yes! The deployment uses repository secrets, not your personal credentials. Anyone with push access to main can trigger deployments.

### Q: Do I need to manually SSH to the server after deployment?
**A:** No! The workflow handles everything. But you can SSH to verify the code was updated if needed.

### Q: What if I need to deploy to multiple servers?
**A:** Create separate GitHub Actions workflows for each server. Each needs its own SSH key and secrets in GitHub.

---

## Deployment Questions

### Q: How long does deployment take?
**A:** Approximately 10 seconds from push to live. Network latency and git pull size are the main factors.

### Q: What if my code is large and git pull is slow?
**A:** The deployment will wait. GitHub Actions logs show progress. Timeouts can be configured in the workflow if needed.

### Q: Can I deploy specific commits, not just the latest?
**A:** The current workflow always deploys the latest main branch. To deploy older code:
```bash
git revert HEAD
git push origin main
```

### Q: What gets deployed?
**A:** Everything in your `main` branch. Only files tracked by git are deployed.

### Q: Are untracked files removed on the server?
**A:** No. Git pull only updates tracked files. Server files and configs not in git remain unchanged.

### Q: How do I know if deployment succeeded?
**A:** Check GitHub Actions:
1. Go to https://github.com/niyongaboemmy/cur-mis/actions
2. Click the latest workflow run
3. Check "Deploy to cPanel Production" job status

---

## Troubleshooting

### Q: I get "Permission denied (publickey)" error
**A:** 
1. Verify public key is in `~/.ssh/authorized_keys` on server
2. Check permissions: `chmod 600 ~/.ssh/authorized_keys`
3. Verify CPANEL_SSH_KEY secret contains the **private** key, not public key
4. SSH directly to server and test: `ssh -i deploy_key -p 2083 user@cyimo-whm-private.aos.rw`

### Q: GitHub Actions says "Repository not found"
**A:**
1. Verify git is installed on server: `git --version`
2. Check git remote: `git remote -v` (should show GitHub URL)
3. If git repo doesn't exist, initialize it:
   ```bash
   cd /production/path
   git init
   git remote add origin https://github.com/niyongaboemmy/cur-mis.git
   git fetch origin
   ```

### Q: Deployment failed but I don't see the error
**A:**
1. Check GitHub Actions logs - they show SSH errors
2. Click the failed workflow and expand the "Deploy to cPanel Production" step
3. Look for SSH error messages
4. SSH to server and run `git pull origin main` manually to see error

### Q: Production code didn't update even though deployment succeeded
**A:**
1. Check server file modification time: `ls -la /production/path`
2. Verify git was actually pulled: `git log --oneline -1`
3. Check if web server is serving from the right directory
4. Clear any application caches:
   - PHP: `php artisan cache:clear`
   - JavaScript: Clear browser cache
5. Restart web server if needed: `systemctl restart apache2`

### Q: SSH connection times out
**A:**
1. Verify server is online and accessible
2. Test SSH manually: `ssh -p 2083 user@cyimo-whm-private.aos.rw`
3. Check firewall allows port 2083 outbound
4. Check cPanel server logs for SSH issues
5. Consider increasing timeout in workflow if server is slow

### Q: Can't login to GitHub to add secrets
**A:**
1. Use GitHub token or password authentication
2. If 2FA enabled, generate a personal access token:
   - Go to https://github.com/settings/tokens
   - Create token with `repo` and `workflow` scopes
   - Use token instead of password

---

## Customization

### Q: I need to run database migrations on deploy
**A:** Edit `.github/workflows/deploy-to-cpanel.yml` and add after `git pull`:
```bash
php artisan migrate --force
```

### Q: I need to clear caches on deploy
**A:** Add to the SSH commands:
```bash
php artisan cache:clear
php artisan config:clear
npm run build  # if needed
```

### Q: I need to restart the web server
**A:** Add:
```bash
systemctl restart apache2
# or for Nginx:
systemctl restart nginx
# or for PHP-FPM:
systemctl restart php-fpm
```

### Q: I need to run tests before deployment
**A:** Add before deployment:
```bash
npm test
# or
php artisan test
```

### Q: I only want to deploy on tags, not every commit
**A:** Edit workflow trigger:
```yaml
on:
  push:
    tags:
      - 'v*'
```

### Q: I want to deploy to staging first, then production
**A:** Create two workflows:
```yaml
# deploy-to-staging.yml
on:
  push:
    branches:
      - develop
# deploy-to-production.yml  
on:
  push:
    branches:
      - main
```

---

## Rollback & Recovery

### Q: How do I undo a bad deployment?
**A:** Simple revert:
```bash
git revert HEAD
git push origin main
```
A new deployment is triggered automatically with the old code.

### Q: How do I deploy a specific older commit?
**A:** Check the commit hash:
```bash
git log --oneline | head -20
```

Then revert to it:
```bash
git reset --hard <commit_hash>
git push origin main --force
```
⚠️ Only force push if you're sure! Involves risky operations.

### Q: The server is in a broken state, what do I do?
**A:** 
1. SSH to production server
2. Check what's wrong: `git status`, `git log`
3. Fix manually if needed
4. Or deploy a known-good commit:
   ```bash
   git checkout <good_commit_hash>
   ```

### Q: I need to update production without pushing new code
**A:** SSH to server and run manually:
```bash
cd /production/path
git pull origin main
php artisan cache:clear  # if using Laravel
```

---

## Security

### Q: Is my SSH key safe in GitHub Secrets?
**A:** Yes. GitHub Secrets are:
- Encrypted at rest
- Only decrypted in GitHub Actions
- Never shown in logs
- Only accessible to authorized people
- Ideal for storing SSH keys

### Q: What if someone gets my deploy key?
**A:**
1. Go to GitHub Secrets
2. Update CPANEL_SSH_KEY with a new key
3. On server, remove the old public key from `~/.ssh/authorized_keys`
4. Generate and add new key
5. Old key is now useless

### Q: Should I use the same key for multiple servers?
**A:** No. Each server should have its own key:
1. Better security isolation
2. If one server is compromised, others are still safe
3. Easier to revoke access to one server

### Q: What permissions should the deploy user have?
**A:** Minimal needed:
- Read/write access to production directory
- Ability to run git commands
- (Optional) Ability to restart services
- NOT root or sudo access

### Q: Can I see deployment history?
**A:** Yes! GitHub Actions logs show all deployments:
- What was deployed
- When it was deployed  
- Who triggered it (via commit)
- Success/failure status
- SSH output

---

## Advanced

### Q: How do I deploy a monorepo with multiple apps?
**A:** Modify the workflow to deploy only changed directories:
```yaml
- name: Deploy only if backend changed
  if: contains(github.event.head_commit.modified, 'backend/')
  run: |
    ssh ... << 'EOF'
    cd $PRODUCTION_PATH/backend
    git pull origin main
    EOF
```

### Q: Can I run the deployment workflow manually?
**A:** Yes! Add `workflow_dispatch`:
```yaml
on:
  push:
    branches:
      - main
  workflow_dispatch:  # Allows manual trigger
```
Then in GitHub Actions, click "Run workflow"

### Q: How do I add Slack notifications?
**A:** Add this to the workflow:
```yaml
- name: Notify Slack
  if: always()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "Deployment ${{ job.status }}",
        "channel": "#deployments"
      }
```

### Q: Can I prevent pushes to main until tests pass?
**A:** Yes, in GitHub repository settings:
1. Go to Branches → main → Require status checks to pass
2. Require GitHub Actions workflow to pass

### Q: How do I add deployment approvals?
**A:** Use GitHub Environments:
1. Create environment in repository settings
2. Add deployment protection rules
3. Modify workflow to use environment
4. Require approval before deployment

---

## Performance

### Q: How can I speed up deployments?
**A:** 
- Use shallow clones: `git clone --depth 1`
- Only pull specific files: `git sparse-checkout`
- Skip large files: Git LFS
- Cache dependencies: Pre-install on server

### Q: My git pull is taking too long
**A:**
1. Check server network speed
2. Large repo? Consider shallow clone
3. Large files? Use Git LFS
4. Lots of history? Consider new clone

---

## Getting Help

If you can't find the answer here:
1. Check `DEPLOYMENT_SETUP.md` for detailed troubleshooting
2. Review GitHub Actions workflow logs for errors
3. SSH to server and test manually
4. Check GitHub repository security settings
5. Verify all secrets are set correctly

Common resources:
- GitHub Actions documentation: https://docs.github.com/en/actions
- Git documentation: https://git-scm.com/doc
- cPanel documentation: your server's control panel

---

**Still stuck?** Check the deployment logs:
1. GitHub Actions: https://github.com/niyongaboemmy/cur-mis/actions
2. Server logs: SSH and check git output
3. Application logs: Check your application's error logs
