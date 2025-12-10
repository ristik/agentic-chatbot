"""Web Fetch Tool using trafilatura and readability"""
from typing import Literal
from pydantic import BaseModel, Field, HttpUrl
import trafilatura
from readability import Document
import html2text
import requests
import uuid


class FetchInput(BaseModel):
    """Input schema for web fetch"""
    url: HttpUrl = Field(..., description="URL to fetch")
    format: Literal["markdown", "html", "text"] = Field("markdown", description="Output format")
    max_length: int = Field(50000, le=100000, description="Maximum content length in characters")


async def fetch_tool(input: FetchInput) -> dict:
    """
    Fetch and extract clean content from web pages.

    Uses trafilatura (F1: 0.958) as primary extraction method, with
    readability-lxml as fallback. Supports markdown, HTML, and plain text output.
    """
    try:
        print(f"[Fetch] URL: {input.url}, Format: {input.format}")

        # Fetch HTML - try with SSL verification first, then without if it fails
        # Use realistic browser headers to avoid bot detection
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
        }

        try:
            response = requests.get(
                str(input.url),
                headers=headers,
                timeout=10,
                verify=True
            )
        except requests.exceptions.SSLError as ssl_error:
            print(f"[Fetch] SSL verification failed, retrying without verification: {ssl_error}")
            import warnings
            warnings.filterwarnings('ignore', message='Unverified HTTPS request')
            response = requests.get(
                str(input.url),
                headers=headers,
                timeout=10,
                verify=False  # Disable SSL verification for problematic sites
            )

        # Check for HTTP errors - return immediately without processing body
        if response.status_code >= 400:
            error_message = response.reason
            # Check for error message in common headers
            if 'X-Error-Message' in response.headers:
                error_message = response.headers['X-Error-Message']
            elif 'X-Error' in response.headers:
                error_message = response.headers['X-Error']

            print(f"[Fetch] HTTP Error {response.status_code}: {error_message}")
            return {
                "error": f"HTTP {response.status_code}: {error_message}",
                "status_code": response.status_code,
                "url": str(input.url),
                "message": f"The server returned an error. Status: {response.status_code} {error_message}"
            }

        html = response.text

        # Try trafilatura first (best quality)
        content = trafilatura.extract(
            html,
            include_comments=False,
            include_tables=True,
            no_fallback=False
        )

        if content:
            # Extract metadata
            metadata = trafilatura.extract_metadata(html)
            title = metadata.title if metadata and metadata.title else "Untitled"
            author = metadata.author if metadata and metadata.author else None

            # Convert to requested format
            if input.format == "markdown":
                # trafilatura can output markdown directly, but html2text gives better formatting
                h = html2text.HTML2Text()
                h.ignore_links = False
                h.body_width = 0  # Don't wrap lines
                # First get HTML from trafilatura with better structure
                html_content = trafilatura.extract(html, include_comments=False, include_tables=True, output_format="xml")
                if html_content:
                    content = h.handle(html_content)
                else:
                    content = h.handle(content)
            elif input.format == "text":
                content = trafilatura.extract(html, no_fallback=False, output_format="txt")

            print(f"[Fetch] Extracted {len(content)} chars using trafilatura")

        else:
            # Fallback to readability
            print("[Fetch] Trafilatura failed, falling back to readability")
            doc = Document(html)
            title = doc.title()
            content_html = doc.summary()
            author = None

            if input.format == "markdown":
                h = html2text.HTML2Text()
                h.ignore_links = False
                h.body_width = 0
                content = h.handle(content_html)
            elif input.format == "text":
                # Strip HTML tags for text
                h = html2text.HTML2Text()
                h.ignore_links = True
                h.ignore_images = True
                content = h.handle(content_html)
            else:  # html
                content = content_html

            print(f"[Fetch] Extracted {len(content)} chars using readability")

        # Truncate if needed
        if len(content) > input.max_length:
            content = content[:input.max_length] + "\n\n[Content truncated...]"
            print(f"[Fetch] Truncated to {input.max_length} chars")

        # Generate unique ID for this fetch
        fetch_id = f"fetch_{str(uuid.uuid4())[:8]}"

        return {
            "id": fetch_id,
            "url": str(input.url),
            "title": title,
            "content": content,
            "excerpt": content[:200] + "..." if len(content) > 200 else content,
            "author": author,
            "length": len(content),
            "format": input.format
        }

    except requests.exceptions.RequestException as e:
        error_msg = f"HTTP request failed: {str(e)}"
        print(f"[Fetch] Error: {error_msg}")
        return {
            "error": error_msg,
            "url": str(input.url),
            "message": "Failed to fetch the URL. Please check if the URL is accessible."
        }
    except Exception as e:
        error_msg = str(e)
        print(f"[Fetch] Error: {error_msg}")
        return {
            "error": error_msg,
            "url": str(input.url),
            "message": "Content extraction failed. The page format may not be supported."
        }
