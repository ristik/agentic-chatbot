import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as cheerio from 'cheerio';

const server = new McpServer({
    name: 'web',
    version: '1.0.0',
});

// Tool: Fetch web page content
server.tool(
    'fetch',
    'Fetch and extract clean text content from a web page URL',
    {
        url: z.string().url().describe('The URL to fetch'),
        selector: z.string().optional().describe('Optional CSS selector to extract specific content'),
    },
    async ({ url, selector }) => {
        try {
            console.log(`[Web] Fetching: ${url}`);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; AgenticBot/1.0)',
                },
            });

            if (!response.ok) {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            error: `HTTP ${response.status}: ${response.statusText}`,
                        }),
                    }],
                };
            }

            const html = await response.text();
            const $ = cheerio.load(html);

            // Remove unwanted elements
            $('script, style, nav, header, footer, iframe, noscript').remove();

            let textContent: string = '';

            if (selector) {
                // Extract content from specific selector
                textContent = $(selector).text();
            } else {
                // Extract main content - try common article selectors first
                const articleSelectors = [
                    'article',
                    'main',
                    '[role="main"]',
                    '.article-content',
                    '.post-content',
                    '.entry-content',
                ];

                let found = false;
                for (const sel of articleSelectors) {
                    const element = $(sel);
                    if (element.length > 0) {
                        textContent = element.text();
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    // Fallback to body
                    textContent = $('body').text();
                }
            }

            // Clean up the text
            textContent = textContent
                .replace(/\s+/g, ' ') // Normalize whitespace
                .replace(/\n{3,}/g, '\n\n') // Max 2 newlines
                .trim();

            // Limit to reasonable size (50KB)
            if (textContent.length > 50000) {
                textContent = textContent.substring(0, 50000) + '\n\n[Content truncated...]';
            }

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        url,
                        title: $('title').text().trim(),
                        content: textContent,
                        length: textContent.length,
                    }),
                }],
            };
        } catch (error) {
            console.error('[Web] Fetch error:', error);
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        error: error instanceof Error ? error.message : 'Failed to fetch URL',
                    }),
                }],
            };
        }
    }
);

// Start server with HTTP transport
async function main() {
    const port = parseInt(process.env.PORT || '3002');

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
    });

    await server.connect(transport);

    const httpServer = createServer((req, res) => {
        if (req.url === '/mcp') {
            transport.handleRequest(req, res);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    httpServer.listen(port, () => {
        console.log(`Web MCP server running on port ${port}`);
    });
}

main().catch(console.error);
