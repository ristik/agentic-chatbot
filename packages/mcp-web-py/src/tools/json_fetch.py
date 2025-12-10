"""JSON Fetch Tool"""
from typing import Literal, Optional
from pydantic import BaseModel, Field, HttpUrl
import requests
import time
import uuid


class JsonFetchInput(BaseModel):
    """Input schema for JSON fetch"""
    url: HttpUrl = Field(..., description="API endpoint URL")
    method: Literal["GET", "POST", "PUT", "DELETE"] = Field("GET", description="HTTP method")
    headers: Optional[dict[str, str]] = Field(None, description="Custom headers (e.g., Authorization)")
    body: Optional[str] = Field(None, description="Request body as JSON string")


async def json_fetch_tool(input: JsonFetchInput) -> dict:
    """
    Fetch JSON data from remote APIs.

    Supports all HTTP methods, custom headers for authentication,
    and handles non-JSON responses gracefully.
    """
    try:
        print(f"[JSONFetch] {input.method} {input.url}")

        start_time = time.time()

        # Prepare headers
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        if input.headers:
            headers.update(input.headers)

        # Make request
        response = requests.request(
            method=input.method,
            url=str(input.url),
            headers=headers,
            data=input.body if input.body else None,
            timeout=10
        )

        response_time = (time.time() - start_time) * 1000  # Convert to milliseconds

        print(f"[JSONFetch] Status: {response.status_code}, Time: {response_time:.2f}ms")

        # Check for HTTP errors - return immediately without processing body
        if response.status_code >= 400:
            error_message = response.reason
            # Check for error message in common headers
            if 'X-Error-Message' in response.headers:
                error_message = response.headers['X-Error-Message']
            elif 'X-Error' in response.headers:
                error_message = response.headers['X-Error']

            print(f"[JSONFetch] HTTP Error {response.status_code}: {error_message}")
            return {
                "error": f"HTTP {response.status_code}: {error_message}",
                "status_code": response.status_code,
                "url": str(input.url),
                "message": f"The API returned an error. Status: {response.status_code} {error_message}",
                "response_time": round(response_time, 2)
            }

        # Try to parse as JSON
        try:
            data = response.json()
        except ValueError:
            # Not JSON, return raw text
            data = {"_raw": response.text, "_note": "Response was not valid JSON"}

        # Generate unique ID for this fetch
        fetch_id = f"json_{str(uuid.uuid4())[:8]}"

        return {
            "id": fetch_id,
            "url": str(input.url),
            "status_code": response.status_code,
            "status_text": response.reason,
            "headers": dict(response.headers),
            "data": data,
            "response_time": round(response_time, 2)
        }

    except requests.exceptions.Timeout:
        error_msg = "Request timed out after 10 seconds"
        print(f"[JSONFetch] Error: {error_msg}")
        return {
            "error": error_msg,
            "url": str(input.url),
            "message": "The API request timed out. The server may be slow or unreachable."
        }
    except requests.exceptions.RequestException as e:
        error_msg = f"HTTP request failed: {str(e)}"
        print(f"[JSONFetch] Error: {error_msg}")
        return {
            "error": error_msg,
            "url": str(input.url),
            "message": "Failed to connect to the API endpoint."
        }
    except Exception as e:
        error_msg = str(e)
        print(f"[JSONFetch] Error: {error_msg}")
        return {
            "error": error_msg,
            "url": str(input.url),
            "message": "An unexpected error occurred while fetching JSON data."
        }
