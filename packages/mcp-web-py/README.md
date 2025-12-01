# MCP Web Server (Python)

Python implementation of the MCP web server providing search, fetch, and JSON fetch capabilities.

## Features

### 🔍 Web Search (`search`)
- Uses DDGS (duckduckgo-search) metasearch library
- Searches multiple backends in parallel (DuckDuckGo, Bing, Brave, Google)
- No API keys required
- Supports region-specific searches
- Reliable and fast

### 📄 Web Fetch (`fetch`)
- Extracts clean content from web pages
- Uses trafilatura (F1: 0.958) with readability-lxml fallback
- Supports markdown, HTML, and plain text output
- Includes metadata extraction (title, author, excerpt)
- Handles complex web pages

### 🔌 JSON Fetch (`json_fetch`)
- Fetches JSON data from APIs
- Supports all HTTP methods (GET, POST, PUT, DELETE)
- Custom headers for authentication
- Graceful error handling
- Response time tracking

## Technology Stack

- **FastMCP**: High-level MCP server framework
- **DDGS**: Metasearch library for web search
- **trafilatura**: Best-in-class content extraction
- **readability-lxml**: Fallback content extraction
- **requests**: HTTP client
- **html2text**: HTML to Markdown conversion

## Installation

### Local Development

```bash
# Install dependencies
pip install -e .

# Run server
python -m src.server
```

### Docker

```bash
# Build
docker build -t mcp-web-py .

# Run
docker run -p 3002:3002 mcp-web-py
```

## Usage

### Search Tool

```python
# Search the web
result = await search(
    query="Python FastMCP",
    max_results=10,
    region="wt-wt",
    backend="auto"
)
```

**Parameters:**
- `query` (str): Search query
- `max_results` (int): Maximum results (1-20, default: 10)
- `region` (str): Region code (`us-en`, `uk-en`, `wt-wt`)
- `backend` (str): Backend (`auto`, `duckduckgo`, `bing`, `brave`, `google`)

**Returns:**
```json
{
  "query": "Python FastMCP",
  "results": [
    {
      "title": "...",
      "url": "...",
      "description": "...",
      "position": 1,
      "provider": "..."
    }
  ],
  "count": 10,
  "backend": "auto"
}
```

### Fetch Tool

```python
# Fetch and extract content
result = await fetch(
    url="https://example.com/article",
    format="markdown",
    max_length=50000
)
```

**Parameters:**
- `url` (str): URL to fetch
- `format` (str): Output format (`markdown`, `html`, `text`)
- `max_length` (int): Maximum content length (default: 50000, max: 100000)

**Returns:**
```json
{
  "url": "...",
  "title": "...",
  "content": "...",
  "excerpt": "...",
  "author": "...",
  "length": 1234,
  "format": "markdown"
}
```

### JSON Fetch Tool

```python
# Fetch JSON from API
result = await json_fetch(
    url="https://api.example.com/data",
    method="GET",
    headers={"Authorization": "Bearer token"}
)
```

**Parameters:**
- `url` (str): API endpoint URL
- `method` (str): HTTP method (`GET`, `POST`, `PUT`, `DELETE`)
- `headers` (dict): Custom headers
- `body` (str): Request body as JSON string

**Returns:**
```json
{
  "url": "...",
  "status_code": 200,
  "status_text": "OK",
  "headers": {...},
  "data": {...},
  "response_time": 123.45
}
```

## Environment Variables

- `PORT`: Server port (default: 3002)

## Testing

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest tests/
```

## Advantages Over TypeScript Implementation

1. **Simpler Stack**: Single language (Python) instead of TypeScript + Python subprocess
2. **Better Search**: DDGS library more reliable than duck-duck-scrape
3. **No Subprocess Overhead**: Direct library calls
4. **Better Content Extraction**: trafilatura (F1: 0.958) vs Mozilla Readability
5. **FastMCP Benefits**: Automatic schema generation, cleaner code
6. **Easier Maintenance**: Fewer dependencies, one language

## Architecture

```
src/
├── server.py           # FastMCP server with tool definitions
├── tools/
│   ├── search.py       # DDGS search implementation
│   ├── fetch.py        # Content extraction with trafilatura
│   └── json_fetch.py   # JSON API client
└── services/
    └── ...             # Shared services (if needed)
```

## License

MIT
