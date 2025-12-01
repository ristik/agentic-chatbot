"""JSON Fetch Tool"""
from typing import Literal, Optional
from pydantic import BaseModel, Field, HttpUrl
import requests
import time


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

        # Try to parse as JSON
        try:
            data = response.json()
        except ValueError:
            # Not JSON, return raw text
            data = {"_raw": response.text, "_note": "Response was not valid JSON"}

        return {
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
