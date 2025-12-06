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

// Helper function to create instructive error messages for the LLM
function createInstructiveError(toolName: string, error: string): string {
    // Parse common error patterns and give helpful advice

    // Missing required argument
    if (error.includes('required') || error.includes('missing')) {
        return `Error: Missing required argument for tool '${toolName}'.\n\n` +
               `Error details: ${error}\n\n` +
               `Please check the tool schema and provide all required arguments.`;
    }

    // Type mismatch
    if (error.includes('type') || error.includes('expected')) {
        return `Error: Invalid argument type for tool '${toolName}'.\n\n` +
               `Error details: ${error}\n\n` +
               `Please check the expected types in the tool schema and convert your arguments accordingly.`;
    }

    // Validation error
    if (error.includes('validation') || error.includes('invalid')) {
        return `Error: Argument validation failed for tool '${toolName}'.\n\n` +
               `Error details: ${error}\n\n` +
               `Please review the argument constraints and provide valid values.`;
    }

    // Generic error
    return `Error executing tool '${toolName}': ${error}\n\n` +
           `Please review the error and try again with corrected arguments.`;
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
            const errorMsg = error instanceof Error ? error.message : String(error);

            // Handle "Server already initialized" error - try to disconnect and reconnect
            if (errorMsg.includes('Server already initialized') || errorMsg.includes('already initialized')) {
                console.warn(`[MCP] Server ${config.name} already initialized, attempting to create new session...`);

                try {
                    // Create a new client with a unique session ID
                    const sessionId = `agent-server-${Date.now()}`;
                    const client = new Client({ name: sessionId, version: '1.0.0' });
                    const transport = new StreamableHTTPClientTransport(new URL(config.url));

                    await client.connect(transport);
                    this.connections.set(config.name, { client, config });
                    console.log(`[MCP] Successfully reconnected to server: ${config.name} with new session`);
                    return;
                } catch (retryError) {
                    console.error(`[MCP] Retry failed for ${config.name}:`, retryError);
                    throw new Error(`MCP connection failed for ${config.name}: Server already initialized. Please restart the MCP server.`);
                }
            }

            console.error(`[MCP] Failed to connect to server: ${config.name}`);
            console.error(`[MCP] Server URL: ${config.url}`);
            console.error(`[MCP] Error:`, errorMsg);
            if (error instanceof Error && error.stack) {
                console.error(`[MCP] Stack trace:`, error.stack);
            }
            throw new Error(`MCP connection failed for ${config.name}: ${errorMsg}`);
        }
    }

    /**
     * Disconnect from all MCP servers
     */
    async disconnect(): Promise<void> {
        console.log(`[MCP] Disconnecting from ${this.connections.size} server(s)...`);

        for (const [name, conn] of this.connections.entries()) {
            try {
                await conn.client.close();
                console.log(`[MCP] Disconnected from ${name}`);
            } catch (error) {
                console.error(`[MCP] Error disconnecting from ${name}:`, error);
            }
        }

        this.connections.clear();
        this.connecting.clear();
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

                                console.log(`[MCP] Returning error to LLM so it can retry with corrected arguments`);

                                // Use helper to create instructive error message
                                const instructiveMsg = createInstructiveError(mcpTool.name, errorMsg);

                                // Return error as content instead of throwing
                                // This allows LLM to see the error and retry
                                return [{
                                    type: 'text',
                                    text: instructiveMsg
                                }];
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
                                console.log(`[MCP] Returning payload size error to LLM so it can refine query`);

                                // Return error instead of throwing so LLM can retry with refined query
                                return [{
                                    type: 'text',
                                    text: `Error: Tool '${mcpTool.name}' returned too much data (${Math.round(payloadSize / 1024)}kb). ` +
                                          `Limit is 50kb. Please refine your query to request less data or be more specific.`
                                }];
                            }

                            return processedContent;
                        } catch (error) {
                            // Network errors, connection failures, etc.
                            console.error(`[MCP] Exception during tool execution: ${mcpTool.name}`);
                            console.error(`[MCP] Error:`, error);

                            const errorMsg = error instanceof Error ? error.message : String(error);

                            console.log(`[MCP] Returning exception to LLM so it can retry`);

                            // Return exception as content instead of throwing
                            return [{
                                type: 'text',
                                text: `Tool execution failed for '${mcpTool.name}': ${errorMsg}\n\nThis may be a temporary issue. Please try again or use different arguments.`
                            }];
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

    isConnected(serverName: string): boolean {
        return this.connections.has(serverName);
    }
}

// Global singleton instance - connections are reused across requests
export const globalMcpManager = new McpManager();
