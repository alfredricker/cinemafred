#!/bin/bash

# Google Cloud Manager Script for CinemaFred HLS Converter
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
SERVICE_NAME="hls-worker"
IMAGE_NAME="us-central1-docker.pkg.dev/$PROJECT_ID/hls/converter"

# Help function
show_help() {
    echo -e "${BLUE}Google Cloud Manager for CinemaFred HLS Converter${NC}"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --build              Build and push container image"
    echo "  --deploy             Deploy service to Cloud Run"
    echo "  --logs               Show service logs (real-time)"
    echo "  --logs-tail          Show recent logs"
    echo "  --status             Show service status"
    echo "  --health             Test health endpoint"
    echo "  --test               Run full deployment test"
    echo "  --delete             Delete the service"
    echo "  --shutdown-all       Shutdown ALL Cloud Run services (emergency stop)"
    echo "  --cleanup            Clean up old revisions and unused resources"
    echo "  --setup              Initial setup (enable APIs, create secrets)"
    echo "  --url                Get service URL"
    echo "  --env                Show environment info"
    echo "  --resources          Show all running resources and costs"
    echo "  --containers         Show running container instances"
    echo "  --billing            Show current billing and usage"
    echo "  --help, -h           Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 --build --deploy  # Build and deploy in one command"
    echo "  $0 --logs            # View real-time logs"
    echo "  $0 --status --health # Check status and health"
    echo "  $0 --resources       # Show all billable resources"
    echo "  $0 --containers      # Show running container instances"
    echo "  $0 --shutdown-all    # Emergency: shutdown ALL Cloud Run services"
    echo "  $0 --billing         # Show billing information and costs"
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
    gcloud services enable containerregistry.googleapis.com
    gcloud services enable artifactregistry.googleapis.com
    
    # Configure Docker for Artifact Registry
    log_info "Configuring Docker for Artifact Registry..."
    gcloud auth configure-docker us-central1-docker.pkg.dev
    
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

# Deploy function
deploy_service() {
    log_step "Deploying service to Cloud Run..."
    
    # Load environment variables from .env file if it exists
    if [ -f .env ]; then
        log_info "Loading environment variables from .env"
        export $(grep -v '^#' .env | xargs)
    fi
    
    log_info "Deploying to Cloud Run..."
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
    
    if [ $? -eq 0 ]; then
        log_success "Service deployed successfully"
        get_service_url
    else
        log_error "Service deployment failed"
        exit 1
    fi
}

# Get service URL
get_service_url() {
    SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)' 2>/dev/null)
    if [ -n "$SERVICE_URL" ]; then
        echo -e "${GREEN}🌐 Service URL: $SERVICE_URL${NC}"
        echo -e "${GREEN}📊 Health check: $SERVICE_URL/health${NC}"
        echo -e "${GREEN}🎬 Conversion endpoints:${NC}"
        echo -e "   📤 Upload: $SERVICE_URL/convert/upload"
        echo -e "   🔄 Existing: $SERVICE_URL/convert/existing"
    else
        log_error "Could not retrieve service URL"
    fi
}

# Show logs
show_logs() {
    log_info "Showing service logs..."
    
    # Use Cloud Logging API directly (works without log-streaming component)
    gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME" \
        --limit=30 \
        --format="table(timestamp,severity,textPayload)" \
        --freshness=1h \
        --project=$PROJECT_ID 2>/dev/null || {
        log_warning "Cloud Logging not available, opening logs in browser..."
        echo "View logs at: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME"
    }
}

# Show recent logs
show_recent_logs() {
    log_info "Showing recent logs..."
    
    # Use Cloud Logging to get recent logs
    gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME" \
        --limit=50 \
        --format="table(timestamp,severity,textPayload)" \
        --freshness=1h
}

# Check service status
check_status() {
    log_step "Checking service status..."
    
    # Get service details
    if gcloud run services describe $SERVICE_NAME --region $REGION &> /dev/null; then
        echo -e "${CYAN}Service Details:${NC}"
        gcloud run services describe $SERVICE_NAME --region $REGION \
            --format="table(metadata.name,status.url,status.conditions[0].type,status.conditions[0].status)"
        
        echo -e "\n${CYAN}Recent Revisions:${NC}"
        gcloud run revisions list --service=$SERVICE_NAME --region=$REGION \
            --format="table(metadata.name,status.conditions[0].type,status.conditions[0].status,metadata.creationTimestamp)" \
            --limit=5
    else
        log_error "Service $SERVICE_NAME not found in region $REGION"
        exit 1
    fi
}

# Test health endpoint
test_health() {
    log_step "Testing health endpoint..."
    
    SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)' 2>/dev/null)
    
    if [ -z "$SERVICE_URL" ]; then
        log_error "Could not retrieve service URL"
        exit 1
    fi
    
    echo "Testing: $SERVICE_URL/health"
    
    # Test with curl
    if curl -f -s --max-time 10 "$SERVICE_URL/health" > /dev/null; then
        log_success "Health check passed!"
        
        # Show health response
        echo -e "${CYAN}Health Response:${NC}"
        curl -s "$SERVICE_URL/health" | jq . 2>/dev/null || curl -s "$SERVICE_URL/health"
    else
        log_error "Health check failed"
        echo "Service may be starting up or experiencing issues"
        echo "Check logs with: $0 --logs"
        exit 1
    fi
}

# Delete service
delete_service() {
    log_warning "This will delete the service $SERVICE_NAME"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_step "Deleting service..."
        gcloud run services delete $SERVICE_NAME --region $REGION --quiet
        log_success "Service deleted"
    else
        log_info "Deletion cancelled"
    fi
}

# Shutdown ALL Cloud Run services (emergency stop)
shutdown_all_services() {
    log_warning "🚨 EMERGENCY SHUTDOWN - This will delete ALL Cloud Run services in the project!"
    echo -e "${RED}This action will:${NC}"
    echo "  • Delete ALL Cloud Run services in project: $PROJECT_ID"
    echo "  • Stop ALL running container instances"
    echo "  • This cannot be undone!"
    echo ""
    
    # Show current services
    echo -e "${YELLOW}Current Cloud Run services:${NC}"
    local services=$(gcloud run services list --region=$REGION --format="value(metadata.name)" 2>/dev/null || echo "")
    
    if [ -z "$services" ]; then
        echo "✅ No Cloud Run services found to delete"
        return 0
    fi
    
    echo "$services" | while read -r service; do
        if [ -n "$service" ]; then
            echo "  • $service"
        fi
    done
    
    echo ""
    echo -e "${RED}⚠️  WARNING: This will PERMANENTLY DELETE all services above!${NC}"
    read -p "Type 'DELETE ALL SERVICES' to confirm: " -r
    echo
    
    if [[ "$REPLY" == "DELETE ALL SERVICES" ]]; then
        log_step "🛑 Shutting down all Cloud Run services..."
        
        echo "$services" | while read -r service; do
            if [ -n "$service" ]; then
                echo "Deleting service: $service"
                gcloud run services delete "$service" --region=$REGION --quiet 2>/dev/null || echo "  ⚠️  Could not delete $service"
            fi
        done
        
        log_success "🛑 All Cloud Run services have been shut down"
        
        # Also show remaining resources
        echo ""
        echo -e "${YELLOW}Remaining billable resources:${NC}"
        show_resources
        
    else
        log_info "Emergency shutdown cancelled"
    fi
}

# Clean up old revisions and unused resources
cleanup_resources() {
    log_step "Cleaning up old revisions and unused resources..."
    
    echo -e "${CYAN}=== CLOUD RUN CLEANUP ===${NC}"
    
    # Get all revisions for the service
    echo -e "${YELLOW}Current revisions:${NC}"
    gcloud run revisions list --service=$SERVICE_NAME --region=$REGION --format="table(
        metadata.name:label=REVISION,
        status.conditions[0].status:label=STATUS,
        metadata.creationTimestamp:label=CREATED,
        status.traffic[0].percent:label=TRAFFIC%
    )" --limit=10
    
    echo ""
    echo -e "${YELLOW}Cleaning up old revisions (keeping latest 3)...${NC}"
    
    # Get revisions older than the latest 3, excluding those with traffic
    local old_revisions=$(gcloud run revisions list --service=$SERVICE_NAME --region=$REGION \
        --format="value(metadata.name)" --sort-by="~metadata.creationTimestamp" \
        --filter="status.traffic[0].percent=0 OR status.traffic[0].percent=null" \
        --limit=100 | tail -n +4)
    
    if [ -n "$old_revisions" ]; then
        echo "Found old revisions to delete:"
        echo "$old_revisions"
        echo ""
        read -p "Delete these old revisions? (y/N): " -n 1 -r
        echo
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "$old_revisions" | while read -r revision; do
                if [ -n "$revision" ]; then
                    echo "Deleting revision: $revision"
                    gcloud run revisions delete "$revision" --region=$REGION --quiet 2>/dev/null || echo "  ⚠️  Could not delete $revision (might be serving traffic)"
                fi
            done
            log_success "Old revisions cleanup completed"
        else
            log_info "Revision cleanup cancelled"
        fi
    else
        echo "✅ No old revisions to clean up"
    fi
    
    echo ""
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
    echo "   • Removed old Cloud Run revisions (keeping latest 3)"
    echo "   • Removed old container images (keeping latest 5)"
    echo "   • This helps reduce storage costs and clutter"
}

# Show environment info
show_env() {
    echo -e "${CYAN}Environment Information:${NC}"
    echo "Project ID: $PROJECT_ID"
    echo "Region: $REGION"
    echo "Service Name: $SERVICE_NAME"
    echo "Image Name: $IMAGE_NAME"
    echo ""
    echo -e "${CYAN}Current gcloud config:${NC}"
    gcloud config list
}

# Show running container instances
show_containers() {
    log_step "Checking running container instances..."
    
    echo -e "${CYAN}Cloud Run Services:${NC}"
    gcloud run services list --region=$REGION --format="table(
        metadata.name:label=SERVICE,
        status.url:label=URL,
        status.conditions[0].status:label=STATUS,
        spec.template.spec.containers[0].image:label=IMAGE,
        status.traffic[0].percent:label=TRAFFIC%
    )"
    
    echo ""
    echo -e "${CYAN}Active Cloud Run Revisions:${NC}"
    gcloud run revisions list --service=$SERVICE_NAME --region=$REGION --format="table(
        metadata.name:label=REVISION,
        status.conditions[0].status:label=STATUS,
        metadata.creationTimestamp:label=CREATED,
        spec.containers[0].resources.limits.cpu:label=CPU,
        spec.containers[0].resources.limits.memory:label=MEMORY
    )" --limit=5
    
    echo ""
    echo -e "${CYAN}Container Instances (if any):${NC}"
    # Check if there are any running instances
    local instances=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.traffic[0].revisionName)" 2>/dev/null || echo "")
    if [ -n "$instances" ]; then
        echo "Current revision serving traffic: $instances"
        
        # Get instance count (this is approximate as Cloud Run auto-scales)
        local min_instances=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(spec.template.metadata.annotations['run.googleapis.com/execution-environment'])" 2>/dev/null || echo "0")
        local max_instances=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(spec.template.spec.containerConcurrency)" 2>/dev/null || echo "1000")
        
        echo "Scaling: 0 to 30 instances (configured max)"
        echo "Concurrency: Up to 1 request per instance"
    else
        echo "No active instances found"
    fi
}

# Show all resources that cost money
show_resources() {
    log_step "Checking all billable resources..."
    
    echo -e "${CYAN}=== COMPUTE RESOURCES ===${NC}"
    
    echo -e "${YELLOW}Cloud Run Services:${NC}"
    gcloud run services list --format="table(
        metadata.name:label=SERVICE,
        metadata.namespace:label=REGION,
        status.conditions[0].status:label=STATUS,
        spec.template.spec.containers[0].resources.limits.cpu:label=CPU,
        spec.template.spec.containers[0].resources.limits.memory:label=MEMORY
    )"
    
    echo ""
    echo -e "${YELLOW}Compute Engine Instances:${NC}"
    local compute_instances=$(gcloud compute instances list --format="value(name)" 2>/dev/null | wc -l)
    if [ "$compute_instances" -gt 0 ]; then
        gcloud compute instances list --format="table(
            name:label=INSTANCE,
            zone:label=ZONE,
            status:label=STATUS,
            machineType.scope(machineTypes):label=TYPE
        )"
    else
        echo "No Compute Engine instances found ✅"
    fi
    
    echo ""
    echo -e "${CYAN}=== STORAGE RESOURCES ===${NC}"
    
    echo -e "${YELLOW}Cloud Storage Buckets:${NC}"
    local buckets=$(gsutil ls 2>/dev/null | wc -l || echo "0")
    if [ "$buckets" -gt 0 ]; then
        gsutil ls -L -b gs://* 2>/dev/null | grep -E "gs://|Storage class|Location|Size" || echo "Unable to list bucket details"
    else
        echo "No Cloud Storage buckets found ✅"
    fi
    
    echo ""
    echo -e "${CYAN}=== CONTAINER REGISTRY ===${NC}"
    
    echo -e "${YELLOW}Artifact Registry Repositories:${NC}"
    gcloud artifacts repositories list --format="table(
        name:label=REPOSITORY,
        location:label=LOCATION,
        format:label=FORMAT,
        createTime:label=CREATED
    )" 2>/dev/null || echo "No Artifact Registry repositories found"
    
    echo ""
    echo -e "${YELLOW}Container Images:${NC}"
    gcloud artifacts docker images list $REGION-docker.pkg.dev/$PROJECT_ID --format="table(
        IMAGE:label=IMAGE,
        DIGEST:label=DIGEST,
        CREATE_TIME:label=CREATED,
        UPDATE_TIME:label=UPDATED
    )" --limit=10 2>/dev/null || echo "No container images found"
    
    echo ""
    echo -e "${CYAN}=== NETWORKING ===${NC}"
    
    echo -e "${YELLOW}Load Balancers:${NC}"
    local lb_count=$(gcloud compute forwarding-rules list --format="value(name)" 2>/dev/null | wc -l)
    if [ "$lb_count" -gt 0 ]; then
        gcloud compute forwarding-rules list --format="table(
            name:label=NAME,
            region:label=REGION,
            IPAddress:label=IP,
            target:label=TARGET
        )"
    else
        echo "No load balancers found ✅"
    fi
    
    echo ""
    echo -e "${CYAN}=== DATABASES ===${NC}"
    
    echo -e "${YELLOW}Cloud SQL Instances:${NC}"
    local sql_instances=$(gcloud sql instances list --format="value(name)" 2>/dev/null | wc -l)
    if [ "$sql_instances" -gt 0 ]; then
        gcloud sql instances list --format="table(
            name:label=INSTANCE,
            region:label=REGION,
            tier:label=TIER,
            status:label=STATUS
        )"
    else
        echo "No Cloud SQL instances found ✅"
    fi
    
    echo ""
    echo -e "${CYAN}=== SUMMARY ===${NC}"
    echo -e "${GREEN}💰 Resources that may incur costs:${NC}"
    echo "   • Cloud Run: $(gcloud run services list --format="value(name)" 2>/dev/null | wc -l) service(s)"
    echo "   • Compute Engine: $compute_instances instance(s)"
    echo "   • Storage Buckets: $buckets bucket(s)"
    echo "   • SQL Instances: $sql_instances instance(s)"
    echo "   • Load Balancers: $lb_count balancer(s)"
    
    echo ""
    echo -e "${BLUE}💡 Cost Optimization Tips:${NC}"
    echo "   • Cloud Run only charges when serving requests"
    echo "   • Delete unused container images to save storage costs"
    echo "   • Monitor your billing dashboard regularly"
    echo "   • Set up budget alerts for cost control"
}

# Show billing information
show_billing() {
    log_step "Checking billing information..."
    
    echo -e "${CYAN}=== BILLING OVERVIEW ===${NC}"
    
    # Get billing account
    local billing_account=$(gcloud beta billing projects describe $PROJECT_ID --format="value(billingAccountName)" 2>/dev/null || echo "")
    if [ -n "$billing_account" ]; then
        echo "Billing Account: $billing_account"
    else
        echo "No billing account linked or unable to retrieve"
    fi
    
    echo ""
    echo -e "${YELLOW}Current Month Usage (if available):${NC}"
    
    # Try to get current usage - this requires billing API to be enabled
    gcloud billing budgets list --billing-account=$billing_account --format="table(
        displayName:label=BUDGET,
        amount.specifiedAmount.currencyCode:label=CURRENCY,
        amount.specifiedAmount.units:label=AMOUNT
    )" 2>/dev/null || echo "Unable to retrieve billing data (Billing API may not be enabled)"
    
    echo ""
    echo -e "${BLUE}💡 Billing Management:${NC}"
    echo "   • View detailed billing: https://console.cloud.google.com/billing"
    echo "   • Set up budget alerts: https://console.cloud.google.com/billing/budgets"
    echo "   • Monitor costs: https://console.cloud.google.com/billing/reports"
    echo "   • Enable billing export for detailed analysis"
    
    echo ""
    echo -e "${YELLOW}Estimated Cloud Run Costs:${NC}"
    echo "   • CPU: \$0.00002400 per vCPU-second"
    echo "   • Memory: \$0.00000250 per GiB-second"  
    echo "   • Requests: \$0.40 per million requests"
    echo "   • Free tier: 2 million requests/month, 400,000 GiB-seconds/month"
}

# Full deployment test
run_full_test() {
    log_step "Running full deployment test..."
    
    check_prerequisites
    build_image
    deploy_service
    sleep 10  # Wait for service to start
    test_health
    
    log_success "Full deployment test completed successfully!"
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
                deploy_service
                shift
                ;;
            --logs)
                show_logs
                shift
                ;;
            --logs-tail)
                show_recent_logs
                shift
                ;;
            --status)
                check_status
                shift
                ;;
            --health)
                test_health
                shift
                ;;
            --test)
                run_full_test
                shift
                ;;
            --delete)
                delete_service
                shift
                ;;
            --shutdown-all)
                shutdown_all_services
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
            --url)
                get_service_url
                shift
                ;;
            --env)
                show_env
                shift
                ;;
            --resources)
                show_resources
                shift
                ;;
            --containers)
                show_containers
                shift
                ;;
            --billing)
                show_billing
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
