import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { McpServerConfig } from '@agentic/shared';
import { tool, type CoreTool } from 'ai';
import { z } from 'zod';
import { imageStore } from '../../store/image-store.js';

interface ConnectedMcp {
    client: Client;
    config: McpServerConfig;
}

interface ToolContext {
    userId?: string;
    userIp?: string;
    userCountry?: string;
}

export class McpManager {
    private connections: Map<string, ConnectedMcp> = new Map();
    private connecting: Map<string, Promise<void>> = new Map();

    async connect(configs: McpServerConfig[]): Promise<void> {
        for (const config of configs) {
            // If already connected, skip
            if (this.connections.has(config.name)) {
                console.log(`[MCP] Already connected to ${config.name}, reusing connection`);
                continue;
            }

            // If currently connecting, wait for it
            if (this.connecting.has(config.name)) {
                console.log(`[MCP] Connection to ${config.name} in progress, waiting...`);
                await this.connecting.get(config.name);
                continue;
            }

            // Start new connection
            console.log(`[MCP] Initiating connection to ${config.name}...`);
            const connectPromise = this.connectSingle(config);
            this.connecting.set(config.name, connectPromise);

            try {
                await connectPromise;
            } finally {
                this.connecting.delete(config.name);
            }
        }
    }

    private async connectSingle(config: McpServerConfig): Promise<void> {
        try {
            console.log(`[MCP] Connecting to server: ${config.name} at ${config.url}`);
            const client = new Client({ name: 'agent-server', version: '1.0.0' });
            const transport = new StreamableHTTPClientTransport(new URL(config.url));

            await client.connect(transport);
            this.connections.set(config.name, { client, config });
            console.log(`[MCP] Successfully connected to server: ${config.name}`);
        } catch (error) {
            console.error(`[MCP] Failed to connect to server: ${config.name}`);
            console.error(`[MCP] Server URL: ${config.url}`);
            console.error(`[MCP] Error:`, error instanceof Error ? error.message : error);
            if (error instanceof Error && error.stack) {
                console.error(`[MCP] Stack trace:`, error.stack);
            }
            throw new Error(`MCP connection failed for ${config.name}: ${error instanceof Error ? error.message : error}`);
        }
    }

    async getTools(serverNames: string[], context?: ToolContext): Promise<Record<string, CoreTool>> {
        const tools: Record<string, CoreTool> = {};
        const allowedServers = new Set(serverNames);

        for (const [serverName, { client }] of this.connections) {
            // Only include tools from servers that are in the allowed list
            if (!allowedServers.has(serverName)) {
                continue;
            }

            let mcpTools;
            try {
                const result = await client.listTools();
                mcpTools = result.tools;
                console.log(`[MCP] Listed ${mcpTools.length} tools from ${serverName}`);
            } catch (error) {
                console.error(`[MCP] Failed to list tools from ${serverName}:`, error);
                throw error;
            }

            // Debug: Log tool details if DEBUG_MCP is enabled
            if (process.env.DEBUG_MCP === 'true') {
                console.log(`[MCP Debug] Tools from ${serverName}:`);
                mcpTools.forEach((tool, idx) => {
                    console.log(`[MCP Debug]   ${idx + 1}. ${tool.name}`);
                    console.log(`[MCP Debug]      Description: ${tool.description}`);
                    console.log(`[MCP Debug]      Input Schema:`, JSON.stringify(tool.inputSchema, null, 2));
                });
            }

            for (const mcpTool of mcpTools) {
                const toolName = `${serverName}_${mcpTool.name}`;

                // Convert MCP tool to AI SDK tool
                tools[toolName] = tool({
                    description: mcpTool.description || '',
                    parameters: this.jsonSchemaToZod(mcpTool.inputSchema),
                    execute: async (args) => {
                        console.log(`[MCP] Executing tool: ${mcpTool.name} on server: ${serverName}`);

                        // Pass user metadata to MCP servers for context-aware features
                        const meta = context ? {
                            userId: context.userId,
                            userIp: context.userIp,
                            userCountry: context.userCountry,
                        } : undefined;

                        // Debug: Log MCP tool call details
                        if (process.env.DEBUG_MCP === 'true') {
                            console.log(`[MCP Debug] Tool args:`, JSON.stringify(args, null, 2));
                            console.log(`[MCP Debug]   Metadata:`, JSON.stringify(meta, null, 2));
                        }

                        try {
                            const result = await client.callTool({
                                name: mcpTool.name,
                                arguments: args,
                                _meta: meta,
                            });

                            if (result.isError) {
                                console.error(`[MCP] Tool execution error: ${mcpTool.name}`);
                                console.error(`[MCP] Error content:`, JSON.stringify(result.content, null, 2));

                                const errorMsg = Array.isArray(result.content)
                                    ? result.content.map(c => (c as any).text || c).join('\n')
                                    : JSON.stringify(result.content);

                                throw new Error(`MCP tool ${mcpTool.name} failed: ${errorMsg}`);
                            }

                            console.log(`[MCP] Tool ${mcpTool.name} completed successfully`);

                            // If we find base64 images, store them and replace with URL
                            const content = result.content as any[];
                            const processedContent = content.map((item: any) => {
                                if (item.type === 'image' && item.data) {
                                    console.log(`[MCP] Intercepting image from tool ${mcpTool.name}`);
                                    const imageId = imageStore.store(item.data, item.mimeType);
                                    const baseUrl = process.env.API_BASE_URL || 'http://localhost:5173';
                                    const imageUrl = `${baseUrl}/api/images/${imageId}`;

                                    console.log(`[MCP] Stored image ${imageId}, replacing with URL: ${imageUrl}`);

                                    // Return as text so LLM sees the URL
                                    // We use markdown image syntax
                                    return {
                                        type: 'text',
                                        text: `![Image](${imageUrl})`
                                    };
                                }
                                return item;
                            });

                            if (process.env.DEBUG_MCP === 'true') {
                                console.log(`[MCP Debug] Result:`, JSON.stringify(processedContent, null, 2).substring(0, 500));
                            }

                            // Enforce payload size limit
                            const payloadSize = JSON.stringify(processedContent).length;
                            const MAX_PAYLOAD_SIZE = 50 * 1024; // 50kb

                            if (payloadSize > MAX_PAYLOAD_SIZE) {
                                console.error(`[MCP] Tool ${mcpTool.name} returned too much data: ${payloadSize} bytes (limit: ${MAX_PAYLOAD_SIZE})`);
                                throw new Error(
                                    `_MCP tool_ '${mcpTool.name}' _returned too much data (${Math.round(payloadSize / 1024)}kb). ` +
                                    `Limit is 50kb. Please refine your query or ask the tool to return less data._`
                                );
                            }

                            return processedContent;
                        } catch (error) {
                            console.error(`[MCP] Exception during tool execution: ${mcpTool.name}`);
                            console.error(`[MCP] Error:`, error);
                            throw error;
                        }
                    },
                });
            }
        }

        return tools;
    }

    private jsonSchemaToZod(schema: any): z.ZodType {
        // JSON Schema to Zod conversion. Consider using a library like zod-to-json-schema (reversed)
        if (!schema || schema.type !== 'object') {
            return z.object({}).passthrough();
        }

        const shape: Record<string, z.ZodType> = {};
        const properties = schema.properties || {};
        const required = new Set(schema.required || []);

        for (const [key, prop] of Object.entries(properties) as [string, any][]) {
            let zodType: z.ZodType;

            switch (prop.type) {
                case 'string':
                    zodType = z.string();
                    break;
                case 'number':
                case 'integer':
                    zodType = z.number();
                    break;
                case 'boolean':
                    zodType = z.boolean();
                    break;
                case 'array':
                    zodType = z.array(z.any());
                    break;
                default:
                    zodType = z.any();
            }

            if (prop.description) {
                zodType = zodType.describe(prop.description);
            }

            shape[key] = required.has(key) ? zodType : zodType.optional();
        }

        return z.object(shape);
    }

    async disconnect(): Promise<void> {
        for (const [name, { client }] of this.connections) {
            await client.close();
            console.log(`Disconnected from MCP server: ${name}`);
        }
        this.connections.clear();
    }

    isConnected(serverName: string): boolean {
        return this.connections.has(serverName);
    }
}

// Global singleton instance - connections are reused across requests
export const globalMcpManager = new McpManager();
