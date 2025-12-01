import { streamText, type CoreMessage } from 'ai';
import { createLLMProvider } from './llm/providers.js';
import { createMemoryTool, type ToolContext } from './tools/memory.js';
import { globalMcpManager } from './mcp/manager.js';
import type { ActivityConfig, ChatMessage } from '@agentic/shared';

export interface AgentContext {
    activity: ActivityConfig;
    userId: string;
    messages: ChatMessage[];
    userIp?: string;
    userCountry?: string;
}

function getUserFriendlyError(error: unknown): string {
    const errorStr = error instanceof Error ? error.message : String(error);

    // API errors
    if (errorStr.includes('API key') || errorStr.includes('GOOGLE_API_KEY')) {
        return '_Sorry, there\'s a configuration issue. Please contact support._';
    }

    // Rate limiting
    if (errorStr.includes('rate limit') || errorStr.includes('429')) {
        return '_I\'m receiving too many requests right now. Please try again in a moment._';
    }

    // Network errors
    if (errorStr.includes('ECONNREFUSED') || errorStr.includes('ENOTFOUND') || errorStr.includes('network')) {
        return '_I\'m having trouble connecting. Please check your internet connection and try again._';
    }

    // Database errors
    if (errorStr.includes('database') || errorStr.includes('postgres') || errorStr.includes('relation')) {
        return '_There was a database issue. Your request couldn\'t be saved, but you can continue chatting._';
    }

    // Tool execution errors
    if (errorStr.includes('ToolExecutionError')) {
        return '_One of my tools encountered an error. Please try rephrasing your request._';
    }

    // Model errors
    if (errorStr.includes('Invalid Request') || errorStr.includes('parts field')) {
        return '_I had trouble understanding the request format. Please try again._';
    }

    // Generic fallback
    return '_Something went wrong. Please try again or rephrase your request._';
}

function convertToCoreMessages(messages: ChatMessage[]): CoreMessage[] {
    return messages
        .filter(msg => {
            // Filter out messages with no content or empty text
            if (!msg.content || msg.content.length === 0) return false;

            // For text messages, check if all text parts are empty
            const hasNonEmptyContent = msg.content.some(c => {
                if (c.type === 'text') return c.text && c.text.trim().length > 0;
                if (c.type === 'image') return c.url && c.url.length > 0;
                return true; // Keep other content types
            });

            return hasNonEmptyContent;
        })
        .map(msg => {
            if (msg.role === 'user') {
                return {
                    role: 'user',
                    content: msg.content
                        .filter(c => {
                            // Filter out empty text content
                            if (c.type === 'text') return c.text && c.text.trim().length > 0;
                            return true;
                        })
                        .map(c => {
                            if (c.type === 'text') return { type: 'text' as const, text: c.text };
                            if (c.type === 'image') return { type: 'image' as const, image: c.url };
                            return { type: 'text' as const, text: JSON.stringify(c) };
                        }),
                };
            } else {
                return {
                    role: 'assistant',
                    content: msg.content
                        .filter(c => {
                            // Filter out empty text content
                            if (c.type === 'text') return c.text && c.text.trim().length > 0;
                            return true;
                        })
                        .map(c => {
                            if (c.type === 'text') return { type: 'text' as const, text: c.text };
                            return { type: 'text' as const, text: JSON.stringify(c) };
                        }),
                };
            }
        });
}

export async function* runAgentStream(ctx: AgentContext) {
    const { activity, userId, messages, userIp, userCountry } = ctx;

    try {
        console.log('[Agent] Starting agent stream for activity:', activity.id);

        // Initialize LLM
        const model = createLLMProvider(activity.llm);
        console.log('[Agent] LLM provider created:', activity.llm.provider, activity.llm.model);

        // Initialize tools
        const toolContext: ToolContext = { userId, activityId: activity.id };
        const localTools: Record<string, any> = {};

        if (activity.localTools.includes('memory')) {
            localTools.memory = createMemoryTool(toolContext);
        }

        // Connect to MCP servers (reuses existing connections)
        await globalMcpManager.connect(activity.mcpServers);

        // Get tools only from servers configured for this activity
        // Pass user metadata (IP, country) for geolocation-based features
        const allowedServerNames = activity.mcpServers.map(s => s.name);
        const mcpTools = await globalMcpManager.getTools(allowedServerNames, { userId, userIp, userCountry });
        console.log('[Agent] Tools loaded for activity', activity.id + ':', Object.keys({ ...localTools, ...mcpTools }));

        const allTools = { ...localTools, ...mcpTools };

        // Convert messages to AI SDK format
        const coreMessages = convertToCoreMessages(messages);
        console.log('[Agent] Processing', coreMessages.length, 'messages');

        // Enhanced system prompt with XML delimiters for clarity
        const enhancedSystemPrompt = `${activity.systemPrompt}

IMPORTANT INSTRUCTIONS FOR MESSAGE HANDLING:
- The conversation history is provided in the messages array
- The LAST message in the array is ALWAYS the current user's input that you need to respond to
- Previous messages provide context but focus your response on addressing the latest user message
- When you see tool results, they are responses to YOUR previous tool calls, not new user requests`;

        // Debug logging - log the full prompt structure
        if (process.env.DEBUG_PROMPTS === 'true') {
            console.log('SYSTEM PROMPT:');
            console.log(enhancedSystemPrompt);
            console.log('\nMESSAGES ARRAY:');
            coreMessages.forEach((msg, idx) => {
                console.log(`\n[Message ${idx + 1}] Role: ${msg.role}`);
                if (Array.isArray(msg.content)) {
                    msg.content.forEach((part, partIdx) => {
                        if (part.type === 'text') {
                            console.log(`  [Part ${partIdx + 1}] Text: ${part.text.substring(0, 200)}${part.text.length > 200 ? '...' : ''}`);
                        } else {
                            console.log(`  [Part ${partIdx + 1}] Type: ${part.type}`);
                        }
                    });
                } else {
                    console.log(`  Content: ${typeof msg.content === 'string' ? msg.content.substring(0, 200) : JSON.stringify(msg.content).substring(0, 200)}`);
                }
            });
            console.log('\nAVAILABLE TOOLS:', Object.keys(allTools));
        }

        // Run the agent loop with streaming
        const result = streamText({
            model,
            system: enhancedSystemPrompt,
            messages: coreMessages,
            tools: allTools,
            maxSteps: 10, // Allow up to 10 tool calls
            onStepFinish: ({ toolCalls, toolResults, text, finishReason }) => {
                // Log tool usage for debugging
                if (toolCalls?.length) {
                    console.log('[Agent] Tool calls:', toolCalls.map(t => t.toolName));
                    if (process.env.DEBUG_PROMPTS === 'true') {
                        toolCalls.forEach(tc => {
                            console.log(`  Tool: ${tc.toolName}, Args:`, JSON.stringify(tc.args, null, 2));
                        });
                    }
                }
                if (toolResults?.length && process.env.DEBUG_PROMPTS === 'true') {
                    console.log('[Agent] Tool results:');
                    toolResults.forEach(tr => {
                        console.log(`  Tool: ${tr.toolName}, Result:`, JSON.stringify(tr.result, null, 2).substring(0, 500));
                    });
                }
                console.log('[Agent] Step finished. Current text length:', text.length, 'Finish reason:', finishReason || 'none');
            },
        });

        console.log('[Agent] Starting text stream...');
        let charCount = 0;
        let reasoningText = '';
        const debugLLM = process.env.DEBUG_PROMPTS === 'true';

        // Stream the response - use fullStream to get all events
        try {
            for await (const part of result.fullStream) {
                // if (debugLLM) {
                //     console.log('[Agent] Stream part type:', part.type);
                // }
                if (part.type === 'text-delta') {
                    charCount += part.textDelta.length;
                    yield { type: 'text-delta', text: part.textDelta };
                } else if (part.type === 'reasoning') {
                    // Extended thinking models emit reasoning content
                    reasoningText += part.textDelta;
                    yield { type: 'reasoning', text: part.textDelta };
                } else if (part.type === 'tool-call') {
                    console.log('[Agent] Tool call:', part.toolName, 'with args:', JSON.stringify(part.args).substring(0, 100));
                    yield { type: 'tool-call', toolName: part.toolName };
                } else if (part.type === 'tool-result') {
                    console.log('[Agent] Tool result for:', part.toolName);

                    // Check for tool errors and notify user in a friendly way
                    if (part.result && typeof part.result === 'object') {
                        const resultStr = JSON.stringify(part.result);
                        if (resultStr.includes('"error"') || resultStr.includes('relation') || resultStr.includes('does not exist')) {
                            console.error('[Agent] Tool error detected:', part.toolName, resultStr.substring(0, 200));
                            yield {
                                type: 'text-delta',
                                text: `\n\n_[System: There was a technical issue. Please try again or rephrase your request.]_\n\n`
                            };
                        }
                    }
                } else if (part.type === 'error') {
                    console.error('[Agent] Stream error:', part.error);
                    // Send user-friendly error message
                    const errorMsg = getUserFriendlyError(part.error);
                    yield { type: 'text-delta', text: `\n\n${errorMsg}\n\n` };
                } else if (part.type === 'finish') {
                    console.log('[Agent] Finish reason:', part.finishReason);
                    if (reasoningText) {
                        console.log('[Agent] Total reasoning text length:', reasoningText.length);
                        if (debugLLM) {
                            console.log('[Agent] Complete reasoning text:', reasoningText);
                        }
                    }
                }
            }
        } catch (streamError) {
            console.error('[Agent] Error in stream:', streamError);
            const errorMsg = getUserFriendlyError(streamError);
            yield { type: 'text-delta', text: `\n\n${errorMsg}\n\n` };
        }

        console.log('[Agent] Stream complete. Total characters:', charCount);

        // Signal completion (keep MCP connections alive for reuse)
        yield { type: 'done' };
    } catch (error) {
        console.error('[Agent] Error in runAgentStream:', error);
        const errorMsg = getUserFriendlyError(error);
        yield { type: 'text-delta', text: `\n\n${errorMsg}\n\n` };
        yield { type: 'done' };
    }
}
