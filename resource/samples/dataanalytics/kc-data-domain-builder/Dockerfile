# Use official lightweight Python image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PORT=8080 \
    GOOGLE_CLOUD_LOCATION="global"

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Expose standard Cloud Run port
EXPOSE 8080

# Start FastAPI application with uvicorn
CMD ["uvicorn", "app:fastapi_app", "--host", "0.0.0.0", "--port", "8080"]

