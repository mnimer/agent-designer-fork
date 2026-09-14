"""
Process Toolset for High-Volume Document Analyzer.
Author: Mike Nimer <mikenimer@google.com>

Provides asynchronous batch downloading, concurrency control, MIME type validation,
and credential management for the High-Volume Document Analyzer agent.
"""

import asyncio
import base64
import logging
import os
import ssl
import time
from typing import Any

import aiohttp
import certifi
import google.auth
from google.cloud import secretmanager

# Configuration constants
MAX_CONCURRENT_DOWNLOADS = int(os.getenv("MAX_CONCURRENT_DOWNLOADS", "5"))
USE_MOCK_API = os.getenv("USE_MOCK_API", "True").lower() in ("true", "1", "t")
DOCUMENT_API_BASE_URL = os.getenv(
    "DOCUMENT_API_BASE_URL", "http://127.0.0.1:5050/documents"
)
URL_TOKEN_API_URL = os.getenv(
    "URL_TOKEN_API_URL", "http://127.0.0.1:5050/token"
)

ALLOWED_MIME_TYPES = [
    "application/pdf",
    "text/html",
    "text/plain",
    "image/png",
    "image/jpeg",
    "image/webp",
]
GENERIC_MIME_TYPES = [
    "application/octet-stream",
    "binary/octet-stream",
]

_SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
_SECRET_CLIENT: secretmanager.SecretManagerServiceClient | None = None
_CACHED_CREDENTIALS: dict[str, str | None] = {"key": None, "secret": None}
_TOKEN_CACHE: dict[str, Any] = {"access_token": None, "expires_at": 0}


def get_secret_client() -> secretmanager.SecretManagerServiceClient:
    """Returns a singleton client for Google Cloud Secret Manager."""
    global _SECRET_CLIENT
    if _SECRET_CLIENT is None:
        _SECRET_CLIENT = secretmanager.SecretManagerServiceClient()
    return _SECRET_CLIENT


def get_secret(project_id: str, secret_id: str, version_id: str = "latest") -> str | None:
    """Fetches a secret payload from Google Cloud Secret Manager."""
    try:
        client = get_secret_client()
        name = client.secret_version_path(
            project=project_id, secret=secret_id, secret_version=version_id
        )
        response = client.access_secret_version(request={"name": name})
        return response.payload.data.decode("UTF-8")
    except Exception as e:
        logging.warning(f"SECRET_MANAGER: Error fetching '{secret_id}': {e}")
        return None


def get_credentials() -> tuple[str | None, str | None]:
    """Retrieves client credentials using local cache, env vars, or Secret Manager."""
    if _CACHED_CREDENTIALS["key"] and _CACHED_CREDENTIALS["secret"]:
        return _CACHED_CREDENTIALS["key"], _CACHED_CREDENTIALS["secret"]

    key = os.getenv("CLIENT_ID")
    secret = os.getenv("CLIENT_SECRET")

    if key and secret and not key.startswith("prod-"):
        _CACHED_CREDENTIALS["key"] = key
        _CACHED_CREDENTIALS["secret"] = secret
        return key, secret

    try:
        _creds, project_id = google.auth.default()
        if not project_id:
            logging.info("Project ID not auto-detected.")

        key_content = get_secret(project_id, key or "CLIENT_ID")
        secret_content = get_secret(project_id, secret or "CLIENT_SECRET")

        if key_content and secret_content:
            _CACHED_CREDENTIALS["key"] = key_content
            _CACHED_CREDENTIALS["secret"] = secret_content
            return key_content, secret_content
    except Exception as e:
        logging.error(f"AUTH CONFIG: Error loading credentials from Secret Manager: {e}")

    return None, None


async def get_auth_token_async() -> str:
    """Obtains OAuth access token asynchronously with token caching."""
    global _TOKEN_CACHE
    current_time = time.time()

    if _TOKEN_CACHE["access_token"] and current_time < (_TOKEN_CACHE["expires_at"] - 60):
        return _TOKEN_CACHE["access_token"]

    consumer_key, consumer_secret = get_credentials()
    if not consumer_key or not consumer_secret:
        raise ValueError("Credentials not found.")

    basic = f"{consumer_key}:{consumer_secret}"
    base64_basic = base64.b64encode(basic.encode("ascii")).decode("ascii")
    headers = {
        "Authorization": f"Basic {base64_basic}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = {"grant_type": "client_credentials"}

    logging.info("AUTH: Renewing access token...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                URL_TOKEN_API_URL,
                data=data,
                headers=headers,
                ssl=_SSL_CONTEXT,
                timeout=10,
            ) as resp:
                resp.raise_for_status()
                response_json = await resp.json()

                token = response_json["access_token"]
                expires_in = int(response_json.get("expires_in", 3600))

                _TOKEN_CACHE["access_token"] = token
                _TOKEN_CACHE["expires_at"] = current_time + expires_in
                return token
    except Exception as e:
        logging.error(f"AUTH: Critical failure obtaining token: {e}")
        raise


async def fetch_document_urls_async(collection_id: str) -> list[str]:
    """Fetches list of document URLs for a given collection ID."""
    if USE_MOCK_API:
        logging.info(f"MOCK API: Fetching mock document list for collection '{collection_id}'")
        return [
            "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        ]

    try:
        token = await get_auth_token_async()
        headers = {
            "accept": "application/json",
            "Authorization": f"Bearer {token}",
        }
        if "{collection_id}" in DOCUMENT_API_BASE_URL:
            url = DOCUMENT_API_BASE_URL.format(collection_id=collection_id)
        else:
            url = f"{DOCUMENT_API_BASE_URL}/{collection_id}"

        logging.info(f"API: Fetching list at {url}")
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, ssl=_SSL_CONTEXT, timeout=30) as resp:
                if resp.status != 200:
                    logging.error(f"API: List error {resp.status} - {await resp.text()}")
                    return []
                data = await resp.json()
                if isinstance(data, list):
                    return data
                return []
    except Exception as e:
        logging.error(f"API: Error fetching urls: {e}")
        return []


async def download_file_async(
    session: aiohttp.ClientSession, url: str, semaphore: asyncio.Semaphore
) -> dict | None:
    """Verifies content type header and downloads allowed binary/text files."""
    async with semaphore:
        try:
            async with session.get(url, ssl=_SSL_CONTEXT, timeout=60) as resp:
                if resp.status != 200:
                    return None

                raw_content_type = (
                    resp.headers.get("Content-Type", "")
                    .split(";")[0]
                    .strip()
                    .lower()
                )

                if (
                    raw_content_type not in ALLOWED_MIME_TYPES
                    and raw_content_type not in GENERIC_MIME_TYPES
                ):
                    return None

                content = await resp.read()
                final_mime_type = raw_content_type

                if content.startswith(b"%PDF"):
                    final_mime_type = "application/pdf"

                if final_mime_type not in ALLOWED_MIME_TYPES:
                    return None

                if final_mime_type == "text/html":
                    return {
                        "mime_type": "text/html",
                        "data": content.decode("utf-8", errors="ignore"),
                        "is_binary": False,
                    }
                elif final_mime_type in [
                    "application/pdf",
                    "image/png",
                    "image/jpeg",
                    "image/webp",
                ]:
                    return {
                        "mime_type": final_mime_type,
                        "data": content,
                        "is_binary": True,
                    }
                else:
                    return {
                        "mime_type": "text/plain",
                        "data": content.decode("utf-8", errors="ignore"),
                        "is_binary": False,
                    }
        except Exception as e:
            logging.error(f"DOWNLOAD: Failed at {url}: {e!s}")
            return None


async def download_batch_async(urls: list[str]) -> list[dict | None]:
    """Downloads multiple files in parallel with concurrency semaphore throttling."""
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_DOWNLOADS)
    async with aiohttp.ClientSession() as session:
        tasks = [download_file_async(session, url, semaphore) for url in urls]
        return await asyncio.gather(*tasks)
