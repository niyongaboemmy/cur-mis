#!/bin/bash

# GitHub to cPanel Deployment Setup Script
# This script helps generate SSH keys and provide setup instructions

set -e

echo "======================================"
echo "GitHub to cPanel Deployment Setup"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if deploy_key already exists
if [ -f "deploy_key" ] || [ -f "deploy_key.pub" ]; then
    echo -e "${YELLOW}⚠️  Deploy keys already exist in current directory${NC}"
    read -p "Do you want to regenerate them? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Using existing keys..."
    else
        rm -f deploy_key deploy_key.pub
    fi
fi

# Generate SSH key if it doesn't exist
if [ ! -f "deploy_key" ]; then
    echo -e "${BLUE}🔑 Generating SSH key pair...${NC}"
    ssh-keygen -t rsa -b 4096 -f deploy_key -N "" -C "cur-mis-github-deploy"
    echo -e "${GREEN}✓ SSH keys generated${NC}"
    echo ""
fi

echo -e "${BLUE}📋 Next Steps:${NC}"
echo ""
echo "1. ADD PUBLIC KEY TO cPanel SERVER:"
echo "   ────────────────────────────────"
echo -e "${YELLOW}Copy the contents of deploy_key.pub and add to ~/.ssh/authorized_keys${NC}"
echo ""
echo "   Content of deploy_key.pub:"
echo "   ─────────────────────────"
cat deploy_key.pub
echo ""
echo ""

echo "2. ADD PRIVATE KEY TO GITHUB SECRETS:"
echo "   ──────────────────────────────────"
echo -e "${YELLOW}Copy the ENTIRE contents of deploy_key below and add as CPANEL_SSH_KEY secret${NC}"
echo ""
echo "   Content of deploy_key:"
echo "   ─────────────────────"
cat deploy_key
echo ""
echo ""

echo "3. ADD THESE SECRETS TO GITHUB:"
echo "   ────────────────────────────"
echo "   Go to: https://github.com/niyongaboemmy/cur-mis/settings/secrets/actions"
echo ""
echo -e "${YELLOW}Required Secrets:${NC}"
echo "   • CPANEL_HOST: cyimo-whm-private.aos.rw"
echo "   • CPANEL_USER: [Your cPanel username]"
echo "   • CPANEL_SSH_PORT: 2083"
echo "   • CPANEL_SSH_KEY: [Contents of deploy_key above]"
echo "   • PRODUCTION_PATH: [Path to your production directory]"
echo ""
echo ""

echo "4. SETUP GIT ON cPanel SERVER:"
echo "   ──────────────────────────"
echo -e "${YELLOW}SSH into your server and run:${NC}"
echo ""
echo "   cd /path/to/production"
echo "   git init"
echo "   git remote add origin https://github.com/niyongaboemmy/cur-mis.git"
echo "   git fetch origin"
echo "   git checkout main"
echo ""
echo ""

echo "5. TEST DEPLOYMENT:"
echo "   ─────────────────"
echo "   Push a test commit to main branch:"
echo "   git push origin main"
echo ""
echo "   Then check GitHub Actions:"
echo "   https://github.com/niyongaboemmy/cur-mis/actions"
echo ""
echo ""

echo -e "${GREEN}✓ Setup script completed!${NC}"
echo -e "${YELLOW}⚠️  Keep deploy_key private and never commit it to GitHub${NC}"
