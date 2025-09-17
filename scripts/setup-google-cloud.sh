#!/bin/bash

# Google Cloud Setup Script for CinemaFred Converter
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🌩️ Setting up Google Cloud for CinemaFred Converter${NC}"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI is not installed${NC}"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Step 1: Authentication
echo -e "${YELLOW}🔐 Step 1: Authentication${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "Please authenticate with Google Cloud:"
    gcloud auth login
fi

# Step 2: Project setup
echo -e "${YELLOW}📋 Step 2: Project Setup${NC}"
echo "Current projects:"
gcloud projects list --format="table(projectId,name,projectNumber)"
echo ""

read -p "Enter your Google Cloud Project ID (or press Enter to create new): " PROJECT_ID

if [ -z "$PROJECT_ID" ]; then
    read -p "Enter new project ID: " NEW_PROJECT_ID
    read -p "Enter project name: " PROJECT_NAME
    
    echo "Creating project: $NEW_PROJECT_ID"
    gcloud projects create $NEW_PROJECT_ID --name="$PROJECT_NAME"
    PROJECT_ID=$NEW_PROJECT_ID
fi

echo "Setting project: $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Step 3: Enable billing (required for Cloud Run)
echo -e "${YELLOW}💳 Step 3: Billing${NC}"
echo "⚠️  Cloud Run requires billing to be enabled"
echo "Please ensure billing is enabled for project: $PROJECT_ID"
echo "Visit: https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
read -p "Press Enter when billing is enabled..."

# Step 4: Enable APIs
echo -e "${YELLOW}🔧 Step 4: Enabling APIs${NC}"
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Step 5: Set region
echo -e "${YELLOW}🌍 Step 5: Region Setup${NC}"
echo "Available regions for Cloud Run:"
echo "- us-central1 (Iowa)"
echo "- us-east1 (South Carolina)"
echo "- us-west1 (Oregon)"
echo "- europe-west1 (Belgium)"
echo "- asia-east1 (Taiwan)"

read -p "Enter region (default: us-central1): " REGION
REGION=${REGION:-us-central1}

gcloud config set run/region $REGION

# Step 6: Create secrets
echo -e "${YELLOW}🔒 Step 6: Creating Secrets${NC}"

create_secret() {
    local secret_name=$1
    local secret_description=$2
    
    if gcloud secrets describe $secret_name &> /dev/null; then
        echo -e "${GREEN}✅ Secret $secret_name already exists${NC}"
        read -p "Update it? (y/N): " update_secret
        if [[ $update_secret =~ ^[Yy]$ ]]; then
            read -s -p "Enter $secret_description: " secret_value
            echo ""
            echo -n "$secret_value" | gcloud secrets versions add $secret_name --data-file=-
        fi
    else
        echo -e "${BLUE}Creating secret: $secret_name${NC}"
        read -s -p "Enter $secret_description: " secret_value
        echo ""
        echo -n "$secret_value" | gcloud secrets create $secret_name --data-file=-
    fi
}

create_secret "database-url" "Database URL (e.g., postgresql://user:pass@host:5432/db)"
create_secret "r2-account-id" "Cloudflare R2 Account ID"
create_secret "r2-access-key-id" "Cloudflare R2 Access Key ID"
create_secret "r2-secret-access-key" "Cloudflare R2 Secret Access Key"
create_secret "r2-bucket-name" "Cloudflare R2 Bucket Name"

# Step 7: Configure Docker
echo -e "${YELLOW}🐳 Step 7: Docker Configuration${NC}"
gcloud auth configure-docker

# Step 8: Update existing configuration
echo -e "${YELLOW}📝 Step 8: Updating Configuration${NC}"

# Check if user already has existing setup
if grep -q "cinemafred" README.md 2>/dev/null; then
    echo -e "${GREEN}✅ Found existing Cloud Run setup in README.md${NC}"
    
    # Extract existing values
    EXISTING_REPO=$(grep "Repository for images:" README.md | cut -d' ' -f4 2>/dev/null || echo "")
    EXISTING_SERVICE=$(grep "Cloud run:" README.md | cut -d' ' -f3 2>/dev/null || echo "")
    
    if [ ! -z "$EXISTING_REPO" ]; then
        echo "Found existing repository: $EXISTING_REPO"
        # Extract project from repo URL
        PROJECT_ID=$(echo $EXISTING_REPO | cut -d'/' -f2)
        REGION=$(echo $EXISTING_REPO | cut -d'-' -f1)
    fi
    
    if [ ! -z "$EXISTING_SERVICE" ]; then
        echo "Found existing service: $EXISTING_SERVICE"
        CONVERTER_SERVICE_URL=$EXISTING_SERVICE
    fi
fi

# Update .env with current values
cat >> .env << EOF

# Google Cloud Configuration (added by setup script)
GOOGLE_CLOUD_PROJECT=${PROJECT_ID:-cinemafred}
REGION=${REGION:-us-central1}
CONVERTER_SERVICE_URL=${CONVERTER_SERVICE_URL:-https://hls-worker-835547077998.us-central1.run.app}
EOF

echo -e "${GREEN}✅ Updated .env file with Cloud Run configuration${NC}"

echo ""
echo -e "${GREEN}🎉 Google Cloud setup completed!${NC}"
echo ""
echo -e "${BLUE}📋 Next Steps:${NC}"
echo "1. Deploy the converter: ./scripts/deploy-converter.sh"
echo "2. Update CONVERTER_SERVICE_URL in your main app's environment"
echo "3. Test with: npm run convert-cloud"
echo ""
echo -e "${BLUE}📊 Useful Commands:${NC}"
echo "- View projects: gcloud projects list"
echo "- View secrets: gcloud secrets list"
echo "- View services: gcloud run services list"
echo "- View logs: gcloud run logs tail cinemafred-converter"
echo ""
echo -e "${YELLOW}⚠️  Important:${NC}"
echo "- Update NEXT_PUBLIC_BASE_URL in .env.cloud with your actual domain"
echo "- Add CONVERTER_SERVICE_URL to your production environment variables"
