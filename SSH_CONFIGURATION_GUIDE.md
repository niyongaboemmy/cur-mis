# 🔐 SSH CONFIGURATION GUIDE FOR CPANEL SERVER

## What is SSH?

SSH (Secure Shell) is like a secure tunnel to your server. It lets you:
- Connect to the production server safely
- Run commands on the server
- Deploy code automatically
- Manage files securely

---

## ✅ STEP 1: CHECK IF YOU HAVE SSH KEY

### On Windows (PowerShell):

```powershell
ls $env:USERPROFILE\.ssh\
```

### On Mac/Linux:

```bash
ls -la ~/.ssh/
```

### What You Should See:

```
id_ed25519          (private key - SECRET!)
id_ed25519.pub      (public key - can share)
known_hosts         (list of servers you've connected to)
config              (SSH configuration)
```

If you see these files, you already have SSH keys! ✅

---

## 🆕 STEP 2: CREATE SSH KEY (If You Don't Have One)

### On Windows (PowerShell):

```powershell
ssh-keygen -t rsa -b 4096 -f "$env:USERPROFILE\.ssh\id_rsa" -N ""
```

### On Mac/Linux:

```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""
```

**What this does:**
- Creates a new SSH key pair
- `id_rsa` = private key (keep secret!)
- `id_rsa.pub` = public key (put on server)
- `-b 4096` = 4096-bit encryption (very secure)
- `-N ""` = no password (empty passphrase)

---

## 📋 STEP 3: GET YOUR PUBLIC KEY

### On Windows (PowerShell):

```powershell
Get-Content $env:USERPROFILE\.ssh\id_rsa.pub
```

### On Mac/Linux:

```bash
cat ~/.ssh/id_rsa.pub
```

**Example output:**

```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDa5Z8x9q2... your@email.com
```

**COPY THIS ENTIRE LINE** - You'll need it in the next step!

---

## 🔑 STEP 4: ADD PUBLIC KEY TO CPANEL SERVER

### Option A: Via cPanel Web Interface (EASIEST)

1. Login to cPanel: https://cyimo-whm-private.aos.rw:2083/
2. Search for "SSH Access" or "SSH Keys"
3. Click "Manage SSH Keys"
4. Click "Import Key"
5. Paste your public key (from Step 3)
6. Click "Import"
7. Authorize the key

### Option B: Via SSH Command Line

```bash
ssh -p 2083 curac@cyimo-whm-private.aos.rw "mkdir -p ~/.ssh && echo 'YOUR_PUBLIC_KEY_HERE' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Replace `YOUR_PUBLIC_KEY_HERE` with your actual public key from Step 3.

---

## 🧪 STEP 5: TEST SSH CONNECTION

### Test Simple Connection

```bash
ssh -p 2083 curac@cyimo-whm-private.aos.rw "echo test"
```

**Expected output:**
```
test
```

**If you see "test":** ✅ SSH is working!

**If you see "Permission denied":** ❌ Key not authorized on server

---

## 🛠️ STEP 6: CONFIGURE SSH CONFIG (OPTIONAL - Makes It Easier)

Create or edit `~/.ssh/config` file:

### On Windows (PowerShell):

```powershell
notepad $env:USERPROFILE\.ssh\config
```

### On Mac/Linux:

```bash
nano ~/.ssh/config
```

Add this content:

```
Host cpanel
    HostName cyimo-whm-private.aos.rw
    User curac
    Port 2083
    IdentityFile ~/.ssh/id_rsa
    StrictHostKeyChecking no
```

**Now you can just type:**

```bash
ssh cpanel
```

Instead of:

```bash
ssh -p 2083 curac@cyimo-whm-private.aos.rw
```

---

## 📝 STEP 7: TEST SSH COMMANDS

Once SSH is working, test these commands:

### Check if git is initialized on server

```bash
ssh -p 2083 curac@cyimo-whm-private.aos.rw "cd /home/curac/umis && git status"
```

**Expected output:**
```
On branch main
Your branch is up to date with 'origin/main'.
```

### Check git log

```bash
ssh -p 2083 curac@cyimo-whm-private.aos.rw "cd /home/curac/umis && git log --oneline -5"
```

### Pull latest code

```bash
ssh -p 2083 curac@cyimo-whm-private.aos.rw "cd /home/curac/umis && git pull origin main"
```

---

## 🔴 TROUBLESHOOTING

### Problem: "Permission denied (publickey)"

**Causes:**
1. Public key not on server
2. Wrong username
3. Wrong port
4. Wrong path to private key

**Solutions:**
```bash
# Check if public key is on server
ssh -p 2083 curac@cyimo-whm-private.aos.rw "cat ~/.ssh/authorized_keys"

# Should show your public key

# If not there, add it:
ssh-copy-id -i ~/.ssh/id_rsa.pub -p 2083 curac@cyimo-whm-private.aos.rw
```

---

### Problem: "Connection refused"

**Causes:**
1. Server down
2. Port wrong
3. Host unreachable
4. Firewall blocking

**Solutions:**
```bash
# Test if server is reachable
ping cyimo-whm-private.aos.rw

# Test if port is open
telnet cyimo-whm-private.aos.rw 2083

# Detailed SSH debug
ssh -vvv -p 2083 curac@cyimo-whm-private.aos.rw
```

---

### Problem: "Could not resolve hostname"

**Cause:** DNS not working or hostname is wrong

**Solutions:**
```bash
# Test DNS
nslookup cyimo-whm-private.aos.rw

# Try with IP address instead
ssh -p 2083 curac@197.243.30.91
```

---

### Problem: "Connection reset by peer"

**Causes:**
1. SSH key format wrong
2. Server has restrictions
3. Network issue

**Solutions:**
```bash
# Regenerate key with correct format
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -m pem -N ""

# Then add it to server again
```

---

## ✨ FULL SETUP CHECKLIST

- [ ] SSH key pair created (id_rsa + id_rsa.pub)
- [ ] Public key copied from id_rsa.pub
- [ ] Public key added to server's ~/.ssh/authorized_keys
- [ ] Permissions set correctly on server (chmod 600 ~/.ssh/authorized_keys)
- [ ] SSH connection test successful (echo test works)
- [ ] Git status check works
- [ ] Git pull works
- [ ] SSH config file created (optional)

---

## 🚀 ONCE SSH IS WORKING

You can:

1. **Test Deployment Manually**
```bash
ssh -p 2083 curac@cyimo-whm-private.aos.rw "cd /home/curac/umis && git pull origin main"
```

2. **Check Server Status**
```bash
ssh -p 2083 curac@cyimo-whm-private.aos.rw "cd /home/curac/umis && git log --oneline -1"
```

3. **Verify Production Code**
```bash
ssh -p 2083 curac@cyimo-whm-private.aos.rw "cd /home/curac/umis && ls -la"
```

---

## 📚 QUICK COMMANDS REFERENCE

### Generate Key
```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""
```

### Show Public Key
```bash
cat ~/.ssh/id_rsa.pub
```

### Add Key to Server
```bash
ssh-copy-id -i ~/.ssh/id_rsa.pub -p 2083 curac@cyimo-whm-private.aos.rw
```

### Test Connection
```bash
ssh -p 2083 curac@cyimo-whm-private.aos.rw "echo test"
```

### SSH into Server
```bash
ssh -p 2083 curac@cyimo-whm-private.aos.rw
```

### Run Command on Server
```bash
ssh -p 2083 curac@cyimo-whm-private.aos.rw "your command here"
```

---

## 🔒 SECURITY TIPS

1. **Never share your private key** (id_rsa)
2. **Never paste private key in GitHub Secrets** - only public key info
3. **Protect your private key permissions** (should be 600)
4. **Use strong passphrases** if you create one
5. **Regularly rotate SSH keys** (generate new ones every year)

---

## 📞 NEXT STEPS

1. Follow this guide to set up SSH
2. Test connection with: `ssh -p 2083 curac@cyimo-whm-private.aos.rw "echo test"`
3. If it works, git pull should work too
4. Then GitHub Actions deployments will work automatically!

---

**Once SSH is configured properly, automatic deployment will work!** ✅
