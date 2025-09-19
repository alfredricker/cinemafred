#!/bin/bash

# Google Cloud Job Manager Script for CinemaFred HLS Converter
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-"cinemafred"}
REGION=${REGION:-"us-central1"}
JOB_NAME="hls-converter-job"
IMAGE_NAME="us-central1-docker.pkg.dev/$PROJECT_ID/hls/converter"

# Help function
show_help() {
    echo -e "${BLUE}Google Cloud Job Manager for CinemaFred HLS Converter${NC}"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --build              Build and push container image"
    echo "  --deploy             Deploy job to Cloud Run Jobs"
    echo "  --run                Execute a conversion job"
    echo "  --logs               Show job execution logs"
    echo "  --status             Show job status"
    echo "  --delete             Delete the job"
    echo "  --cleanup            Clean up old images and unused resources"
    echo "  --setup              Initial setup (enable APIs, create repos)"
    echo "  --env                Show environment info"
    echo "  --help, -h           Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 --build --deploy                    # Build and deploy job"
    echo "  $0 --run movie-id [delete] [force]     # Run conversion job"
    echo "  $0 --logs                              # View job logs"
    echo "  $0 --status                            # Check job status"
    echo ""
    echo "Environment Variables:"
    echo "  GOOGLE_CLOUD_PROJECT - Google Cloud project ID (default: cinemafred)"
    echo "  REGION              - Deployment region (default: us-central1)"
}

# Utility functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_step() {
    echo -e "${PURPLE}🔄 $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."
    
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed"
        echo "Install it from: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        echo "Install it from: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    # Check authentication
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        log_warning "Not authenticated with Google Cloud"
        echo "Please run: gcloud auth login"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Setup function
setup_gcloud() {
    log_step "Setting up Google Cloud environment..."
    
    # Set project
    log_info "Setting project: $PROJECT_ID"
    gcloud config set project $PROJECT_ID
    
    # Enable required APIs
    log_info "Enabling required APIs..."
    gcloud services enable cloudbuild.googleapis.com
    gcloud services enable run.googleapis.com
    gcloud services enable artifactregistry.googleapis.com
    
    # Create Artifact Registry repository if it doesn't exist
    log_info "Creating Artifact Registry repository..."
    gcloud artifacts repositories create hls \
        --repository-format=docker \
        --location=$REGION \
        --description="HLS Converter Images" 2>/dev/null || {
        log_info "Repository already exists"
    }
    
    # Configure Docker for Artifact Registry
    log_info "Configuring Docker for Artifact Registry..."
    gcloud auth configure-docker $REGION-docker.pkg.dev
    
    log_success "Google Cloud setup completed"
}

# Build function
build_image() {
    log_step "Building container image..."
    
    log_info "Starting Cloud Build..."
    gcloud builds submit --config cloudbuild.yaml .
    
    if [ $? -eq 0 ]; then
        log_success "Container build completed successfully"
    else
        log_error "Container build failed"
        exit 1
    fi
}

# Deploy job function
deploy_job() {
    log_step "Deploying job to Cloud Run Jobs..."
    
    # Load environment variables from .env file if it exists
    if [ -f .env ]; then
        log_info "Loading environment variables from .env"
        export $(grep -v '^#' .env | xargs)
    fi
    
    log_info "Deploying job to Cloud Run Jobs..."
    gcloud run jobs create $JOB_NAME \
        --image $IMAGE_NAME:latest \
        --region $REGION \
        --memory 16Gi \
        --cpu 4 \
        --max-retries 3 \
        --parallelism 1 \
        --task-timeout 18000 \
        --set-env-vars NODE_ENV=production \
        --set-env-vars DATABASE_URL="$DATABASE_URL" \
        --set-env-vars R2_ACCOUNT_ID="$R2_ACCOUNT_ID" \
        --set-env-vars R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
        --set-env-vars R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
        --set-env-vars R2_BUCKET_NAME="$R2_BUCKET_NAME" 2>/dev/null || {
        
        # If create fails, try update instead
        log_info "Job already exists, updating..."
        gcloud run jobs update $JOB_NAME \
            --image $IMAGE_NAME:latest \
            --region $REGION \
            --memory 16Gi \
            --cpu 4 \
            --max-retries 3 \
            --parallelism 1 \
            --task-timeout 18000 \
            --set-env-vars NODE_ENV=production \
            --set-env-vars DATABASE_URL="$DATABASE_URL" \
            --set-env-vars R2_ACCOUNT_ID="$R2_ACCOUNT_ID" \
            --set-env-vars R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
            --set-env-vars R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
            --set-env-vars R2_BUCKET_NAME="$R2_BUCKET_NAME"
    }
    
    if [ $? -eq 0 ]; then
        log_success "Job deployed successfully"
        show_job_info
    else
        log_error "Job deployment failed"
        exit 1
    fi
}

# Show job info
show_job_info() {
    echo -e "${GREEN}🎬 Job Information:${NC}"
    echo -e "${GREEN}📋 Job Name: $JOB_NAME${NC}"
    echo -e "${GREEN}🌍 Region: $REGION${NC}"
    echo -e "${GREEN}🖼️  Image: $IMAGE_NAME:latest${NC}"
    echo -e "${GREEN}💾 Resources: 16GB RAM, 4 CPU${NC}"
    echo -e "${GREEN}⏱️  Timeout: 5 hours${NC}"
}

# Run a conversion job
run_conversion_job() {
    local movie_id="$1"
    local delete_original="${2:-false}"
    local force="${3:-false}"
    
    if [ -z "$movie_id" ]; then
        log_error "Usage: $0 --run <movie_id> [delete_original] [force]"
        return 1
    fi
    
    log_step "Executing conversion job for movie: $movie_id"
    
    # Execute the job with environment variables
    gcloud run jobs execute $JOB_NAME \
        --region $REGION \
        --update-env-vars MOVIE_ID="$movie_id" \
        --update-env-vars JOB_TYPE="existing" \
        --update-env-vars DELETE_ORIGINAL="$delete_original" \
        --update-env-vars FORCE="$force" \
        --wait
    
    if [ $? -eq 0 ]; then
        log_success "Job executed successfully"
    else
        log_error "Job execution failed"
        return 1
    fi
}

# Check job status
check_job_status() {
    log_step "Checking job status..."
    
    # Get job details
    if gcloud run jobs describe $JOB_NAME --region $REGION &> /dev/null; then
        echo -e "${CYAN}Job Details:${NC}"
        gcloud run jobs describe $JOB_NAME --region $REGION \
            --format="table(metadata.name,status.conditions[0].type,status.conditions[0].status)"
        
        echo -e "\n${CYAN}Recent Executions:${NC}"
        gcloud run jobs executions list --job=$JOB_NAME --region=$REGION \
            --format="table(metadata.name,status.conditions[0].type,status.conditions[0].status,metadata.creationTimestamp)" \
            --limit=5
    else
        log_error "Job $JOB_NAME not found in region $REGION"
        exit 1
    fi
}

# Show job logs
show_job_logs() {
    log_info "Showing job execution logs..."
    
    echo -e "${CYAN}Recent job logs:${NC}"
    gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=$JOB_NAME" \
        --limit=50 \
        --format="table(timestamp,severity,textPayload)" \
        --freshness=1h
}

# Delete job
delete_job() {
    log_warning "This will delete the job $JOB_NAME"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_step "Deleting job..."
        gcloud run jobs delete $JOB_NAME --region $REGION --quiet
        log_success "Job deleted"
    else
        log_info "Deletion cancelled"
    fi
}

# Clean up old images and unused resources
cleanup_resources() {
    log_step "Cleaning up old images and unused resources..."
    
    echo -e "${CYAN}=== CONTAINER IMAGES CLEANUP ===${NC}"
    
    # Clean up old container images
    echo -e "${YELLOW}Container images in Artifact Registry:${NC}"
    local images=$(gcloud artifacts docker images list $REGION-docker.pkg.dev/$PROJECT_ID/hls \
        --format="value(IMAGE)" --sort-by="~CREATE_TIME" --limit=20 2>/dev/null || echo "")
    
    if [ -n "$images" ]; then
        local old_images=$(echo "$images" | tail -n +6)  # Keep latest 5 images
        
        if [ -n "$old_images" ]; then
            echo "Found old container images to delete:"
            echo "$old_images"
            echo ""
            read -p "Delete these old images? (y/N): " -n 1 -r
            echo
            
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                echo "$old_images" | while read -r image; do
                    if [ -n "$image" ]; then
                        echo "Deleting image: $image"
                        gcloud artifacts docker images delete "$image" --quiet 2>/dev/null || echo "  ⚠️  Could not delete $image"
                    fi
                done
                log_success "Old images cleanup completed"
            else
                log_info "Images cleanup cancelled"
            fi
        else
            echo "✅ No old images to clean up (keeping latest 5)"
        fi
    else
        echo "✅ No container images found or unable to list"
    fi
    
    echo ""
    echo -e "${GREEN}💰 Cleanup Summary:${NC}"
    echo "   • Removed old container images (keeping latest 5)"
    echo "   • This helps reduce storage costs"
}

# Show environment info
show_env() {
    echo -e "${CYAN}Environment Information:${NC}"
    echo "Project ID: $PROJECT_ID"
    echo "Region: $REGION"
    echo "Job Name: $JOB_NAME"
    echo "Image Name: $IMAGE_NAME"
    echo ""
    echo -e "${CYAN}Current gcloud config:${NC}"
    gcloud config list
}

# Main script logic
main() {
    if [ $# -eq 0 ]; then
        show_help
        exit 0
    fi
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --build)
                check_prerequisites
                build_image
                shift
                ;;
            --deploy)
                check_prerequisites
                deploy_job
                shift
                ;;
            --run)
                shift
                movie_id="$1"
                delete_original="$2"
                force="$3"
                if [ -z "$movie_id" ]; then
                    log_error "Usage: $0 --run <movie_id> [delete_original] [force]"
                    exit 1
                fi
                run_conversion_job "$movie_id" "$delete_original" "$force"
                shift 3
                [ -n "$4" ] && shift
                ;;
            --logs)
                show_job_logs
                shift
                ;;
            --status)
                check_job_status
                shift
                ;;
            --delete)
                delete_job
                shift
                ;;
            --cleanup)
                cleanup_resources
                shift
                ;;
            --setup)
                check_prerequisites
                setup_gcloud
                shift
                ;;
            --env)
                show_env
                shift
                ;;
            --help|-h)
                show_help
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Run main function
main "$@"
