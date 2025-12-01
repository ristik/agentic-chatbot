#!/usr/bin/env python3
"""
MCP Web Server - Python Implementation with HTTP Transport
Provides web search, fetch, and JSON fetch tools via MCP SDK over HTTP
"""
import asyncio
import json
import os
from typing import Any
from mcp.server import Server
from mcp.types import Tool, TextContent
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.requests import Request
from starlette.responses import StreamingResponse, JSONResponse
import uvicorn

# Import our tool implementations
from src.tools.search import search_tool, SearchInput
from src.tools.fetch import fetch_tool, FetchInput
from src.tools.json_fetch import json_fetch_tool, JsonFetchInput


# Create MCP server instance
mcp_server = Server("web")


@mcp_server.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools"""
    return [
        Tool(
            name="search",
            description="Search the web using DDGS metasearch library. Searches multiple backends (DuckDuckGo, Bing, Brave, Google) in parallel when backend='auto', providing reliable and comprehensive results.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query string",
                        "minLength": 1
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of results to return (1-20)",
                        "minimum": 1,
                        "maximum": 20,
                        "default": 10
                    },
                    "region": {
                        "type": "string",
                        "description": "Region code (us-en, uk-en, wt-wt for worldwide)",
                        "enum": ["us-en", "uk-en", "wt-wt"],
                        "default": "wt-wt"
                    },
                    "backend": {
                        "type": "string",
                        "description": "Search backend (auto for parallel metasearch, or specific: duckduckgo, bing, brave, google)",
                        "default": "auto"
                    }
                },
                "required": ["query"]
            }
        ),
        Tool(
            name="fetch",
            description="Fetch and extract clean content from web pages. Uses trafilatura (F1: 0.958) as primary extraction method with readability-lxml as fallback. Returns clean, readable content.",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "format": "uri",
                        "description": "URL to fetch and extract content from"
                    },
                    "format": {
                        "type": "string",
                        "description": "Output format",
                        "enum": ["markdown", "html", "text"],
                        "default": "markdown"
                    },
                    "max_length": {
                        "type": "integer",
                        "description": "Maximum content length in characters",
                        "minimum": 1,
                        "maximum": 100000,
                        "default": 50000
                    }
                },
                "required": ["url"]
            }
        ),
        Tool(
            name="json_fetch",
            description="Fetch JSON data from remote APIs. Supports all HTTP methods and handles non-JSON responses gracefully.",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "format": "uri",
                        "description": "API endpoint URL"
                    },
                    "method": {
                        "type": "string",
                        "description": "HTTP method",
                        "enum": ["GET", "POST", "PUT", "DELETE"],
                        "default": "GET"
                    },
                    "body": {
                        "type": "string",
                        "description": "Optional request body as JSON string"
                    }
                },
                "required": ["url"]
            }
        )
    ]


@mcp_server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Handle tool calls"""
    try:
        if name == "search":
            # Call search tool
            input_data = SearchInput(
                query=arguments["query"],
                max_results=arguments.get("max_results", 10),
                region=arguments.get("region", "wt-wt"),
                backend=arguments.get("backend", "auto")
            )
            result = await search_tool(input_data)
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False))]

        elif name == "fetch":
            # Call fetch tool
            input_data = FetchInput(
                url=arguments["url"],
                format=arguments.get("format", "markdown"),
                max_length=arguments.get("max_length", 50000)
            )
            result = await fetch_tool(input_data)
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False))]

        elif name == "json_fetch":
            # Call json_fetch tool
            input_data = JsonFetchInput(
                url=arguments["url"],
                method=arguments.get("method", "GET"),
                headers=arguments.get("headers"),
                body=arguments.get("body")
            )
            result = await json_fetch_tool(input_data)
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False))]

        else:
            raise ValueError(f"Unknown tool: {name}")

    except Exception as e:
        import traceback
        traceback.print_exc()
        error_result = {
            "error": str(e),
            "tool": name,
            "message": f"Tool execution failed: {str(e)}"
        }
        return [TextContent(type="text", text=json.dumps(error_result))]


# HTTP Server setup using MCP's SSE transport
async def handle_sse(request: Request):
    """
    Handle SSE endpoint for MCP communication
    This endpoint provides Server-Sent Events transport for MCP protocol
    """
    from mcp.server.sse import sse_server
    from mcp import ClientSession
    from starlette.responses import Response

    async with sse_server() as streams:
        read_stream, write_stream = streams

        # Run MCP server
        init_options = mcp_server.create_initialization_options()

        async def event_generator():
            """Generate SSE events from MCP server"""
            async for message in write_stream:
                yield f"data: {json.dumps(message)}\n\n"

        # Start server task
        server_task = asyncio.create_task(
            mcp_server.run(read_stream, write_stream, init_options)
        )

        try:
            return StreamingResponse(
                event_generator(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                }
            )
        finally:
            server_task.cancel()
            try:
                await server_task
            except asyncio.CancelledError:
                pass


async def handle_messages(request: Request):
    """Handle POST /mcp endpoint - MCP protocol over HTTP (JSON-RPC 2.0)"""
    try:
        body = await request.json()
        method = body.get("method")
        params = body.get("params", {})
        request_id = body.get("id")  # JSON-RPC request ID

        print(f"[MCP] Received method: {method} (id: {request_id})", flush=True)
        if params:
            print(f"[MCP] Params: {json.dumps(params, indent=2)[:500]}", flush=True)

        # Helper function to create JSON-RPC response
        def jsonrpc_response(result):
            response = {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": result
            }
            print(f"[MCP] Sending response for id {request_id}", flush=True)
            return JSONResponse(response)

        def jsonrpc_error(code: int, message: str):
            response = {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {
                    "code": code,
                    "message": message
                }
            }
            print(f"[MCP] Sending error response: {code} - {message}", flush=True)
            return JSONResponse(response, status_code=400)

        # Handle MCP initialization
        if method == "initialize":
            return jsonrpc_response({
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "web",
                    "version": "1.0.0"
                }
            })

        # Handle notifications (no response needed for notifications)
        elif method == "notifications/initialized":
            print("[MCP] Client initialized", flush=True)
            # Notifications don't get responses in JSON-RPC
            return JSONResponse({})

        # Handle ping
        elif method == "ping":
            return jsonrpc_response({})

        # Handle tools listing
        elif method == "tools/list":
            tools = await list_tools()
            return jsonrpc_response({
                "tools": [
                    {
                        "name": tool.name,
                        "description": tool.description,
                        "inputSchema": tool.inputSchema
                    }
                    for tool in tools
                ]
            })

        # Handle tool execution
        elif method == "tools/call":
            tool_name = params.get("name")
            arguments = params.get("arguments", {})
            print(f"[MCP] Calling tool: {tool_name}", flush=True)
            print(f"[MCP] Arguments: {json.dumps(arguments, indent=2)[:300]}", flush=True)

            result = await call_tool(tool_name, arguments)

            print(f"[MCP] Tool {tool_name} completed, returning result", flush=True)
            return jsonrpc_response({
                "content": [{"type": r.type, "text": r.text} for r in result]
            })

        else:
            print(f"[MCP] Unknown method: {method}", flush=True)
            return jsonrpc_error(-32601, f"Method not found: {method}")

    except Exception as e:
        import traceback
        from datetime import datetime
        timestamp = datetime.now().isoformat()
        print(f"\n[MCP ERROR {timestamp}] Exception in handle_messages:", flush=True)
        traceback.print_exc()
        print(f"[MCP ERROR] Request body: {json.dumps(body, indent=2)[:1000]}\n", flush=True)

        # Try to return error response if we have request_id
        try:
            return jsonrpc_error(-32603, f"Internal error: {str(e)}")
        except:
            # If jsonrpc_error fails, return basic error
            return JSONResponse({"error": str(e)}, status_code=500)


# Create Starlette app
app = Starlette(
    debug=True,
    routes=[
        Route("/mcp", handle_messages, methods=["POST"]),
        Route("/sse", handle_sse, methods=["GET"]),
    ]
)


def main():
    """Main entry point"""
    port = int(os.environ.get("PORT", 3002))

    print(f"Starting MCP Web Server on port {port}...", flush=True)
    print("Available tools:", flush=True)
    print("  - search: Web search using DDGS metasearch", flush=True)
    print("  - fetch: Extract clean content from web pages", flush=True)
    print("  - json_fetch: Fetch JSON from APIs", flush=True)
    print(f"\nHTTP endpoint: http://0.0.0.0:{port}/mcp", flush=True)

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )


if __name__ == "__main__":
    main()
