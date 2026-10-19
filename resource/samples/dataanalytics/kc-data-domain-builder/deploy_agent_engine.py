"""
Deploy Knowledge Catalog Data Domain Builder to Vertex AI Agent Engine

Purpose:
Packages and deploys the ADK multi-agent application to Vertex AI Reasoning Engine / Agent Engine.

Architectural Decisions:
- Author: Steve Thill <stevethill@google.com>
- Uses Vertex AI Reasoning Engine preview SDK to provision a fully managed serverless runtime.
- Employs location="global" for Gemini 3.7 Flash models, with the engine deployment host in us-central1.
"""

import os
import sys

# Ensure location is explicitly set
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "1"
os.environ["GOOGLE_CLOUD_LOCATION"] = "global"

try:
    import vertexai
    from vertexai.preview import reasoning_engines
except ImportError:
    print("Error: vertexai SDK not installed. Run: pip install google-cloud-aiplatform")
    sys.exit(1)

from app import app


def deploy():
    """Packages and deploys the ADK App to Vertex AI Agent Engine."""
    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT")
    region = os.environ.get("GOOGLE_CLOUD_REGION", "us-central1")
    staging_bucket = os.environ.get("STAGING_BUCKET")

    if not project_id:
        raise ValueError("GOOGLE_CLOUD_PROJECT environment variable must be set.")
    if not staging_bucket:
        raise ValueError("STAGING_BUCKET environment variable (e.g. gs://my-bucket) must be set.")

    print(f"Initializing Vertex AI for project '{project_id}' in region '{region}'...")
    vertexai.init(project=project_id, location=region, staging_bucket=staging_bucket)

    print("Submitting deployment to Vertex AI Reasoning Engine / Agent Engine...")
    remote_agent = reasoning_engines.ReasoningEngine.create(
        app,
        requirements=[
            "google-adk>=0.1.0",
            "google-auth>=2.0.0",
            "google-cloud-bigquery>=3.20.0",
            "google-cloud-dataplex>=2.0.0",
            "requests>=2.31.0",
            "pydantic>=2.0.0",
        ],
        display_name="kc-data-domain-builder",
        description="Multi-agent system for Dataplex data domain discovery, DDD modeling, and provisioning.",
    )

    print("Successfully deployed to Vertex AI Agent Engine!")
    print(f"Resource Name: {remote_agent.resource_name}")
    return remote_agent


if __name__ == "__main__":
    deploy()

