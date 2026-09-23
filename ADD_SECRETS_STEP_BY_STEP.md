# Add GitHub Secrets - Step by Step

## 🎯 What You're About to Do

Add 5 secrets to GitHub so automatic deployment works. This takes about 5 minutes.

---

## 📍 Step 1: Go to Secrets Page

1. Click this link: https://github.com/niyongaboemmy/cur-mis/settings/secrets/actions
2. You should see "Repository secrets" with existing secrets listed

---

## 🔑 Step 2: Add Secret #1 - CPANEL_HOST

1. Click green **"New repository secret"** button
2. Fill in the form:
   - **Name**: `CPANEL_HOST`
   - **Value**: `cyimo-whm-private.aos.rw`
3. Click **"Add secret"** button
4. ✅ You'll see it added to the list

---

## 🔑 Step 3: Add Secret #2 - CPANEL_USER

1. Click green **"New repository secret"** button again
2. Fill in:
   - **Name**: `CPANEL_USER`
   - **Value**: `curac`
3. Click **"Add secret"** button
4. ✅ You'll see it added to the list

---

## 🔑 Step 4: Add Secret #3 - CPANEL_SSH_PORT

1. Click green **"New repository secret"** button
2. Fill in:
   - **Name**: `CPANEL_SSH_PORT`
   - **Value**: `2083`
3. Click **"Add secret"** button
4. ✅ You'll see it added to the list

---

## 🔑 Step 5: Add Secret #4 - CPANEL_SSH_KEY (The Long One)

This one is long - be careful to copy the entire key!

1. Click green **"New repository secret"** button
2. Fill in:
   - **Name**: `CPANEL_SSH_KEY`
   - **Value**: **Copy the ENTIRE private key** (see below)

### The Private Key to Copy:

**⚠️ IMPORTANT**: Copy from `-----BEGIN OPENSSH PRIVATE KEY-----` to `-----END OPENSSH PRIVATE KEY-----` (including both lines)

```
-----BEGIN OPENSSH PRIVATE KEY-----
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
-----END OPENSSH PRIVATE KEY-----
```

3. Paste into the **Value** field (GitHub will say "Stored securely")
4. Click **"Add secret"** button
5. ✅ You'll see it added to the list

---

## 🔑 Step 6: Add Secret #5 - PRODUCTION_PATH

1. Click green **"New repository secret"** button
2. Fill in:
   - **Name**: `PRODUCTION_PATH`
   - **Value**: `/home/curac/umis`
3. Click **"Add secret"** button
4. ✅ You'll see it added to the list

---

## ✅ Verification Checklist

After adding all 5, you should see:

```
✅ CPANEL_HOST          (Last updated: just now)
✅ CPANEL_USER          (Last updated: just now)
✅ CPANEL_SSH_PORT      (Last updated: just now)
✅ CPANEL_SSH_KEY       (Last updated: just now)
✅ PRODUCTION_PATH      (Last updated: just now)
```

Plus the existing secrets (BACKEND_ENV, CPANEL_PASS, etc.)

---

## 🚀 What Happens Next

1. **Secrets are encrypted** and stored in GitHub
2. **GitHub Actions can access them** automatically
3. **Next push to main** will trigger the deployment workflow
4. **Workflow will use the secrets** to:
   - SSH into cPanel server (cyimo-whm-private.aos.rw)
   - Use username: `curac`
   - Use the SSH key to authenticate
   - Navigate to: `/home/curac/umis`
   - Pull the latest code
   - Production updated!

---

## 📝 Test the Deployment

After adding secrets, test with:

```bash
git commit --allow-empty -m "test: verify deployment works"
git push origin main
```

Then check:
1. Go to: https://github.com/niyongaboemmy/cur-mis/actions
2. Watch the latest workflow run
3. Click "Deploy to cPanel Production" to see logs
4. When it says "✓ built in 23.82s" or similar, it worked!

---

## ⏱️ Timeline

- **Adding Secrets**: 5 minutes
- **After Secrets**: Instant (ready to deploy)
- **Next Push to Main**: Automatic deployment
- **Deployment Time**: ~10 seconds
- **Live to Users**: Immediate

---

## 💡 Tips

✅ Copy-paste the secret values exactly (no extra spaces)  
✅ The SSH key is very long - use copy-paste, don't type it  
✅ Once added, secrets can't be viewed (for security)  
✅ To update a secret, click the pencil icon next to it  

---

## 🎯 Success!

Once all 5 secrets are added:

- ✅ GitHub Actions can deploy
- ✅ Students see Finance Portal button
- ✅ Automatic deployment on every push
- ✅ No manual work needed

**You're done! The system is now fully automated.** 🚀
