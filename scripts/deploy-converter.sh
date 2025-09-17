#!/bin/bash

# Google Cloud Run Deployment Script for FFmpeg Converter
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment variables from .env file
if [ -f .env ]; then
    echo -e "${BLUE}📄 Loading environment variables from .env${NC}"
    export $(grep -v '^#' .env | xargs)
else
    echo -e "${YELLOW}⚠️  No .env file found, using defaults${NC}"
fi

# Configuration
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-"cinemafred"}
REGION=${REGION:-"us-central1"}
SERVICE_NAME="hls-worker"  # Using your existing service name
IMAGE_NAME="us-central1-docker.pkg.dev/$PROJECT_ID/hls/converter"  # Using your existing repo

echo -e "${BLUE}🚀 Deploying FFmpeg Converter to Google Cloud Run${NC}"
echo -e "${BLUE}Project: $PROJECT_ID${NC}"
echo -e "${BLUE}Region: $REGION${NC}"
echo -e "${BLUE}Service: $SERVICE_NAME${NC}"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI is not installed${NC}"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo "Install it from: https://docs.docker.com/get-docker/"
    exit 1
fi

# Authenticate with Google Cloud
echo -e "${YELLOW}🔐 Checking Google Cloud authentication...${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo -e "${YELLOW}Please authenticate with Google Cloud:${NC}"
    gcloud auth login
fi

# Set project
echo -e "${YELLOW}📋 Setting project: $PROJECT_ID${NC}"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo -e "${YELLOW}🔧 Enabling required APIs...${NC}"
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Configure Docker for Artifact Registry
echo -e "${YELLOW}🐳 Configuring Docker for Artifact Registry...${NC}"
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build the Docker image
# Use the image built by Cloud Build (skip local build)
echo -e "${YELLOW}📦 Using image built by Cloud Build: $IMAGE_NAME:latest${NC}"
echo -e "${GREEN}✅ Image already available in Artifact Registry${NC}"

# Create secrets (if they don't exist)
echo -e "${YELLOW}🔒 Creating secrets...${NC}"

# Check if secrets exist, create if not
create_secret_if_not_exists() {
    local secret_name=$1
    local secret_description=$2
    
    if ! gcloud secrets describe $secret_name &> /dev/null; then
        echo -e "${BLUE}Creating secret: $secret_name${NC}"
        echo -n "Enter $secret_description: "
        read -s secret_value
        echo ""
        echo -n "$secret_value" | gcloud secrets create $secret_name --data-file=-
    else
        echo -e "${GREEN}✅ Secret $secret_name already exists${NC}"
    fi
}

create_secret_if_not_exists "database-url" "Database URL"
create_secret_if_not_exists "r2-account-id" "R2 Account ID"
create_secret_if_not_exists "r2-access-key-id" "R2 Access Key ID"
create_secret_if_not_exists "r2-secret-access-key" "R2 Secret Access Key"
create_secret_if_not_exists "r2-bucket-name" "R2 Bucket Name"

# Deploy to Cloud Run
echo -e "${YELLOW}🚀 Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_NAME:latest \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --memory 8Gi \
    --cpu 2 \
    --timeout 3600 \
    --max-instances 30 \
    --min-instances 0 \
    --concurrency 1 \
    --set-env-vars NODE_ENV=production \
    --set-env-vars DATABASE_URL="$DATABASE_URL" \
    --set-env-vars R2_ACCOUNT_ID="$R2_ACCOUNT_ID" \
    --set-env-vars R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
    --set-env-vars R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    --set-env-vars R2_BUCKET_NAME="$R2_BUCKET_NAME"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')

echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}🌐 Service URL: $SERVICE_URL${NC}"
echo -e "${GREEN}📊 Health check: $SERVICE_URL/health${NC}"
echo -e "${GREEN}🎬 Conversion endpoint: $SERVICE_URL/convert${NC}"
echo ""

# Test the health endpoint
echo -e "${YELLOW}🏥 Testing health endpoint...${NC}"
if curl -f "$SERVICE_URL/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Health check passed!${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
    echo "Check the logs: gcloud run logs tail $SERVICE_NAME --region $REGION"
fi

echo ""
echo -e "${BLUE}📝 Next steps:${NC}"
echo "1. Update your main application to use: $SERVICE_URL/convert"
echo "2. Monitor logs: gcloud run logs tail $SERVICE_NAME --region $REGION"
echo "3. View metrics: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME"
echo ""
echo -e "${BLUE}💡 Useful commands:${NC}"
echo "- View logs: gcloud run logs tail $SERVICE_NAME --region $REGION"
echo "- Update service: gcloud run services replace cloud-run-service.yaml --region $REGION"
echo "- Delete service: gcloud run services delete $SERVICE_NAME --region $REGION"
