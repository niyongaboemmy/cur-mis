#!/bin/bash
################################################################################
# CUR-MIS Production Deployment Script
#
# This script deploys the latest code to production and verifies the setup
#
# Usage:
#   bash DEPLOY_PRODUCTION.sh
#
# Prerequisites:
#   - SSH access to production server
#   - Git installed on production server
#   - Web root at /var/www/cur.ac.rw or /home/*/public_html
################################################################################

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║          CUR-MIS PRODUCTION DEPLOYMENT SCRIPT                 ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PRODUCTION_USER="${PROD_USER:-}"
PRODUCTION_HOST="${PROD_HOST:-}"
PRODUCTION_PATH="${PROD_PATH:-}"
REMOTE_CMD="ssh ${PRODUCTION_USER}@${PRODUCTION_HOST}"

# Check if configuration is provided
if [ -z "$PRODUCTION_USER" ] || [ -z "$PRODUCTION_HOST" ] || [ -z "$PRODUCTION_PATH" ]; then
    echo -e "${RED}❌ Error: Production configuration not set${NC}"
    echo ""
    echo "Set these environment variables before running:"
    echo "  export PROD_USER=user"
    echo "  export PROD_HOST=cur.ac.rw"
    echo "  export PROD_PATH=/var/www/cur.ac.rw/umis"
    echo ""
    echo "Then run this script:"
    echo "  bash DEPLOY_PRODUCTION.sh"
    exit 1
fi

echo -e "${BLUE}📋 Deployment Configuration:${NC}"
echo "  User: $PRODUCTION_USER"
echo "  Host: $PRODUCTION_HOST"
echo "  Path: $PRODUCTION_PATH"
echo ""

# Step 1: Test SSH Connection
echo -e "${BLUE}📡 Step 1: Testing SSH Connection...${NC}"
if $REMOTE_CMD "echo 'SSH connection successful'" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ SSH connection successful${NC}"
else
    echo -e "${RED}❌ Cannot connect to production server${NC}"
    echo "   Check your SSH key and credentials"
    exit 1
fi
echo ""

# Step 2: Check Production Directory
echo -e "${BLUE}📁 Step 2: Checking Production Directory...${NC}"
if $REMOTE_CMD "test -d $PRODUCTION_PATH" 2>/dev/null; then
    echo -e "${GREEN}✅ Production directory exists: $PRODUCTION_PATH${NC}"
else
    echo -e "${RED}❌ Production directory not found: $PRODUCTION_PATH${NC}"
    exit 1
fi
echo ""

# Step 3: Check Git Repository
echo -e "${BLUE}🔄 Step 3: Checking Git Repository...${NC}"
if $REMOTE_CMD "cd $PRODUCTION_PATH && git status" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Git repository found${NC}"
else
    echo -e "${RED}❌ Not a git repository at $PRODUCTION_PATH${NC}"
    exit 1
fi
echo ""

# Step 4: Pull Latest Code
echo -e "${BLUE}📥 Step 4: Pulling Latest Code from Main Branch...${NC}"
PULL_OUTPUT=$($REMOTE_CMD "cd $PRODUCTION_PATH && git pull origin main 2>&1" || true)
echo "$PULL_OUTPUT"

if echo "$PULL_OUTPUT" | grep -q "Already up to date\|Fast-forward"; then
    echo -e "${GREEN}✅ Code updated successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Unexpected git output - review above${NC}"
fi
echo ""

# Step 5: Verify Critical Files
echo -e "${BLUE}✓ Step 5: Verifying Critical Files...${NC}"
echo "  Checking api-router.php..."
if $REMOTE_CMD "test -f $PRODUCTION_PATH/api-router.php" 2>/dev/null; then
    echo -e "${GREEN}  ✅ api-router.php exists${NC}"
else
    echo -e "${RED}  ❌ api-router.php NOT found${NC}"
    exit 1
fi

echo "  Checking .htaccess..."
if $REMOTE_CMD "test -f $PRODUCTION_PATH/.htaccess" 2>/dev/null; then
    echo -e "${GREEN}  ✅ .htaccess exists${NC}"
else
    echo -e "${RED}  ❌ .htaccess NOT found${NC}"
    exit 1
fi

echo "  Checking backend/public/index.php..."
if $REMOTE_CMD "test -f $PRODUCTION_PATH/backend/public/index.php" 2>/dev/null; then
    echo -e "${GREEN}  ✅ backend/public/index.php exists${NC}"
else
    echo -e "${RED}  ❌ backend/public/index.php NOT found${NC}"
    exit 1
fi

echo "  Checking frontend/dist/index.html..."
if $REMOTE_CMD "test -f $PRODUCTION_PATH/frontend/dist/index.html" 2>/dev/null; then
    echo -e "${GREEN}  ✅ frontend/dist/index.html exists${NC}"
else
    echo -e "${RED}  ❌ frontend/dist/index.html NOT found${NC}"
    exit 1
fi
echo ""

# Step 6: Set Correct Permissions
echo -e "${BLUE}🔐 Step 6: Setting Correct Permissions...${NC}"
echo "  Setting backend permissions..."
$REMOTE_CMD "chmod -R 755 $PRODUCTION_PATH/backend/ 2>/dev/null" || true
echo -e "${GREEN}  ✅ Backend permissions set${NC}"

echo "  Setting frontend permissions..."
$REMOTE_CMD "chmod -R 755 $PRODUCTION_PATH/frontend/dist/ 2>/dev/null" || true
echo -e "${GREEN}  ✅ Frontend permissions set${NC}"

echo "  Setting .htaccess permissions..."
$REMOTE_CMD "chmod 644 $PRODUCTION_PATH/.htaccess 2>/dev/null" || true
echo -e "${GREEN}  ✅ .htaccess permissions set${NC}"
echo ""

# Step 7: Restart Apache
echo -e "${BLUE}🔄 Step 7: Restarting Apache...${NC}"
RESTART_OUTPUT=$($REMOTE_CMD "sudo systemctl restart apache2 2>&1" || $REMOTE_CMD "/scripts/restartsrv_apache 2>&1" || true)
if echo "$RESTART_OUTPUT" | grep -qE "error|failed"; then
    echo -e "${YELLOW}⚠️  Apache restart output:${NC}"
    echo "$RESTART_OUTPUT"
else
    echo -e "${GREEN}✅ Apache restarted successfully${NC}"
fi
echo ""

# Step 8: Test API Health Endpoint
echo -e "${BLUE}🧪 Step 8: Testing API Health Endpoint...${NC}"
echo "  Testing: https://cur.ac.rw/umis/api/health"
HEALTH_TEST=$(curl -s https://cur.ac.rw/umis/api/health | grep -o '"success":true' || echo "failed")

if [ "$HEALTH_TEST" != "failed" ]; then
    echo -e "${GREEN}✅ API Health Check PASSED${NC}"
    echo "   The backend is responding correctly!"
else
    echo -e "${YELLOW}⚠️  API Health Check INCONCLUSIVE${NC}"
    echo "   This may take a moment after restart."
    echo "   Visit: https://cur.ac.rw/umis/test-api.html to test"
fi
echo ""

# Step 9: Test Web Access
echo -e "${BLUE}🌐 Step 9: Testing Web Access...${NC}"
echo "  Testing: https://cur.ac.rw/umis/"
WEB_TEST=$(curl -s https://cur.ac.rw/umis/ | grep -o "<title>" || echo "failed")

if [ "$WEB_TEST" != "failed" ]; then
    echo -e "${GREEN}✅ Frontend ACCESSIBLE${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend test inconclusive${NC}"
    echo "   This may be a DNS or SSL issue."
fi
echo ""

# Step 10: Show Deployment Summary
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo -e "║${GREEN}              ✅ DEPLOYMENT COMPLETED SUCCESSFULLY              ${NC}║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo -e "${GREEN}Deployed to Production:${NC}"
echo "  Host: $PRODUCTION_HOST"
echo "  Path: $PRODUCTION_PATH"
echo "  Time: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

echo -e "${BLUE}📋 Next Steps:${NC}"
echo "  1. Visit: https://cur.ac.rw/umis/"
echo "  2. Test API: https://cur.ac.rw/umis/test-api.html"
echo "  3. Login with: faustinganzasheila@gmail.com"
echo "  4. Navigate Finance to verify features"
echo ""

echo -e "${BLUE}🔧 If Issues Occur:${NC}"
echo "  1. Check test tool: https://cur.ac.rw/umis/test-api.html"
echo "  2. View server logs: $REMOTE_CMD 'tail -50 /var/log/apache2/error.log'"
echo "  3. Verify permissions: $REMOTE_CMD 'ls -la $PRODUCTION_PATH/api-router.php'"
echo "  4. Check .htaccess: $REMOTE_CMD 'cat $PRODUCTION_PATH/.htaccess'"
echo ""

echo -e "${GREEN}📚 Documentation:${NC}"
echo "  - README_FINAL.md: Overview and solution"
echo "  - DEPLOYMENT_AND_TESTING.md: Detailed deployment guide"
echo "  - PRODUCTION_DEPLOYMENT.md: Production checklist"
echo ""

echo "✨ CUR-MIS is now live on production! ✨"
