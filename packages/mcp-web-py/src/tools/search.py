"""Web Search Tool using DDGS"""
from pydantic import BaseModel, Field
from ddgs import DDGS


class SearchInput(BaseModel):
    """Input schema for web search"""
    query: str = Field(..., min_length=1, description="Search query")
    max_results: int = Field(10, ge=1, le=20, description="Maximum number of results (1-20)")
    region: str = Field("wt-wt", description="Region code (us-en, uk-en, wt-wt for worldwide)")
    backend: str = Field("auto", description="Search backend (auto for parallel metasearch)")


async def search_tool(input: SearchInput) -> dict:
    """
    Search the web using DDGS metasearch library.

    DDGS searches multiple backends (DuckDuckGo, Bing, Brave, Google) in parallel
    when backend="auto", providing more reliable and comprehensive results.
    """
    try:
        print(f"[Search] Query: {input.query}, Region: {input.region}, Backend: {input.backend}, Max: {input.max_results}")

        ddgs = DDGS()
        results = ddgs.text(
            keywords=input.query,
            region=input.region,
            safesearch="off",
            max_results=input.max_results,
            backend=input.backend
        )

        results_list = list(results)

        print(f"[Search] Found {len(results_list)} results")

        return {
            "query": input.query,
            "results": [
                {
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "description": r.get("body", ""),
                    "position": idx + 1,
                    "provider": r.get("source", input.backend)
                }
                for idx, r in enumerate(results_list)
            ],
            "count": len(results_list),
            "backend": input.backend,
            "region": input.region
        }
    except Exception as e:
        error_msg = str(e)
        print(f"[Search] Error: {error_msg}")
        return {
            "error": error_msg,
            "query": input.query,
            "message": "Search failed. Please try again."
        }
