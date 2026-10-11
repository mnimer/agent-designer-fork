#!/usr/bin/env bash
# ==============================================================================
# Deploy Knowledge Catalog Data Domain Builder to Google Cloud Run
# Author: Steve Thill <stevethill@google.com>
# ==============================================================================

set -euo pipefail

# Configuration defaults
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || echo '')}"
REGION="${GOOGLE_CLOUD_REGION:-us-central1}"
SERVICE_NAME="kc-data-domain-builder"
IMAGE_TAG="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "Error: GOOGLE_CLOUD_PROJECT environment variable or active gcloud project required." >&2
  exit 1
fi

echo "==================================================================="
echo " Deploying Knowledge Catalog Domain Builder Agent to Cloud Run"
echo " Project: ${PROJECT_ID}"
echo " Region:  ${REGION}"
echo " Service: ${SERVICE_NAME}"
echo "==================================================================="

# Step 1: Build container image using Cloud Build
echo "Building container image with Google Cloud Build..."
gcloud builds submit --tag "${IMAGE_TAG}" .

# Step 2: Deploy to Cloud Run
echo "Deploying service to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_TAG}" \
  --platform managed \
  --region "${REGION}" \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_LOCATION="global",GOOGLE_CLOUD_PROJECT="${PROJECT_ID}" \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5

echo "Deployment complete! Service URL:"
gcloud run services describe "${SERVICE_NAME}" --platform managed --region "${REGION}" --format 'value(status.url)'

