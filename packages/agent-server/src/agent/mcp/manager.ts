import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { McpServerConfig } from '@agentic/shared';
import { tool, type CoreTool } from 'ai';
import { z } from 'zod';

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
            const client = new Client({ name: 'agent-server', version: '1.0.0' });
            const transport = new StreamableHTTPClientTransport(new URL(config.url));

            await client.connect(transport);
            this.connections.set(config.name, { client, config });
            console.log(`[MCP] Connected to server: ${config.name}`);
        } catch (error) {
            console.error(`[MCP] Failed to connect to ${config.name}:`, error instanceof Error ? error.message : error);
            throw error;
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

            const { tools: mcpTools } = await client.listTools();
            console.log(`[MCP] Loading ${mcpTools.length} tools from ${serverName}`);

            for (const mcpTool of mcpTools) {
                const toolName = `${serverName}_${mcpTool.name}`;

                // Convert MCP tool to AI SDK tool
                tools[toolName] = tool({
                    description: mcpTool.description || '',
                    parameters: this.jsonSchemaToZod(mcpTool.inputSchema),
                    execute: async (args) => {
                        // Pass user metadata to MCP servers for context-aware features
                        const meta = context ? {
                            userId: context.userId,
                            userIp: context.userIp,
                            userCountry: context.userCountry,
                        } : undefined;

                        const result = await client.callTool({
                            name: mcpTool.name,
                            arguments: args,
                            _meta: meta,
                        });
                        return result.content;
                    },
                });
            }
        }

        return tools;
    }

    private jsonSchemaToZod(schema: any): z.ZodType {
        // Simplified JSON Schema to Zod conversion
        // In production, use a library like zod-to-json-schema (reversed)
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
