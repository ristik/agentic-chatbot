import { streamText, type CoreMessage } from 'ai';
import { createLLMProvider } from './llm/providers.js';
import { processTemplate, buildTemplateContext } from './llm/prompt-templates.js';
import { createMemoryTool, formatMemoryForPrompt, type ToolContext } from './tools/memory.js';
import { globalMcpManager } from './mcp/manager.js';
import type { ActivityConfig, ChatMessage } from '@agentic/shared';

// Configuration for tool retry behavior
const ENABLE_TOOL_RETRY = process.env.ENABLE_TOOL_RETRY !== 'false'; // Default: enabled
const MAX_TOOL_RETRIES = parseInt(process.env.MAX_TOOL_RETRIES || '2', 10);

export interface AgentContext {
    activity: ActivityConfig;
    userId: string;
    messages: ChatMessage[];
    userIp?: string;
    userCountry?: string;
    userTimezone?: string;
    userLocale?: string;
    memoryState?: Record<string, any>; // Initial memory state from client
    requestId?: string; // Correlation ID for logging
}

function getUserFriendlyError(error: unknown): string {
    const errorStr = error instanceof Error ? error.message : String(error);

    // API key errors (catch various forms to prevent leaking keys)
    if (errorStr.includes('API key') ||
        errorStr.includes('GOOGLE_API_KEY') ||
        errorStr.includes('Incorrect API key') ||
        errorStr.includes('invalid_api_key') ||
        errorStr.includes('Invalid authentication') ||
        errorStr.includes('401') ||
        errorStr.includes('Unauthorized')) {
        return '_Sorry, there\'s an API configuration issue. Please contact support._';
    }

    // Rate limiting and quota errors
    if (errorStr.includes('rate limit') || errorStr.includes('429')) {
        return '_I\'m receiving too many requests right now. Please try again in a moment._';
    }

    // Gemini API quota errors
    if (errorStr.includes('quota') ||
        errorStr.includes('RESOURCE_EXHAUSTED') ||
        errorStr.includes('Peak input tokens') ||
        errorStr.includes('Peak output tokens') ||
        errorStr.includes('Requests per minute')) {
        return '_API quota limit reached. Please wait a moment before trying again._';
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

/**
 * Truncates messages to stay within safe limits (characters and/or message count).
 * Always keeps the last message (current user input).
 * Removes messages from the beginning of the history if limits are exceeded.
 *
 * @param messages - Array of chat messages
 * @param maxChars - Maximum character limit (0 = no limit)
 * @param maxMessages - Maximum message count (0 = no limit, 1 = only latest, etc.)
 */
function truncateMessages(
    messages: ChatMessage[],
    maxChars: number = 30000,
    maxMessages: number = 0
): ChatMessage[] {
    if (messages.length === 0) return [];

    // Always keep the last message
    const lastMessage = messages[messages.length - 1];
    const otherMessages = messages.slice(0, -1);

    let currentChars = JSON.stringify(lastMessage).length;
    const keptMessages: ChatMessage[] = [lastMessage];

    // Apply message count limit first if specified (maxMessages > 0)
    let candidateMessages = otherMessages;
    if (maxMessages > 0) {
        // maxMessages includes the last message, so we can keep maxMessages - 1 others
        const maxOthers = Math.max(0, maxMessages - 1);
        if (otherMessages.length > maxOthers) {
            candidateMessages = otherMessages.slice(-maxOthers); // Keep most recent
            console.log(`[Agent] Message count limit: keeping ${maxMessages} most recent messages (truncated ${otherMessages.length - maxOthers} older messages)`);
        }
    }

    // Apply character limit if specified (maxChars > 0)
    if (maxChars > 0) {
        // Add messages from the end (most recent) to the beginning
        for (let i = candidateMessages.length - 1; i >= 0; i--) {
            const msg = candidateMessages[i];
            const msgSize = JSON.stringify(msg).length;

            if (currentChars + msgSize > maxChars) {
                console.log(`[Agent] Character limit: reached ${maxChars} chars (truncated ${i + 1} older messages)`);
                break;
            }

            currentChars += msgSize;
            keptMessages.unshift(msg);
        }
    } else {
        // No character limit - add all candidate messages
        candidateMessages.forEach(msg => {
            currentChars += JSON.stringify(msg).length;
            keptMessages.unshift(msg);
        });
    }

    return keptMessages;
}

export async function* runAgentStream(ctx: AgentContext) {
    const { activity, userId, messages, userIp, userCountry, userTimezone, userLocale } = ctx;

    try {
        console.log('[Agent] Starting agent stream for activity:', activity.id);

        // Initialize LLM
        let model;
        try {
            console.log('[Agent] Initializing LLM provider...');
            model = createLLMProvider(activity.llm, { requestId: ctx.requestId });
            console.log('[Agent] LLM provider created successfully');
        } catch (error) {
            console.error('[Agent] Failed to create LLM provider:', error);
            throw error;
        }

        // Initialize tools with memory state from client
        const memoryState = ctx.memoryState || {}; // Use provided state or empty object
        console.log('[Agent] Memory state received:', memoryState, 'Keys:', Object.keys(memoryState));
        const toolContext: ToolContext = {
            userId,
            activityId: activity.id,
            memoryState, // Pass memory state to tool
        };
        const localTools: Record<string, any> = {};

        if (activity.localTools.includes('memory')) {
            localTools.memory = createMemoryTool(toolContext);
        }

        // Connect to MCP servers (reuses existing connections)
        let mcpTools = {};

        // Only connect if MCP servers are configured
        if (activity.mcpServers.length > 0) {
            try {
                console.log('[Agent] Connecting to MCP servers:', activity.mcpServers.map(s => s.name));
                await globalMcpManager.connect(activity.mcpServers);

                // Get tools only from servers configured for this activity
                // Pass user metadata (IP, country) for geolocation-based features
                const allowedServerNames = activity.mcpServers.map(s => s.name);
                mcpTools = await globalMcpManager.getTools(allowedServerNames, { userId, userIp, userCountry });
                console.log('[Agent] MCP tools loaded:', Object.keys(mcpTools));
            } catch (error) {
                console.error('[Agent] ❌ CRITICAL: Failed to connect to MCP servers');
                console.error('[Agent] MCP Error:', error);
                if (error instanceof Error && error.stack) {
                    console.error('[Agent] MCP Stack trace:', error.stack);
                }
                console.error('[Agent] Request ID:', ctx.requestId);

                const errorMsg = error instanceof Error ? error.message : String(error);
                const serverNames = activity.mcpServers.map(s => s.name).join(', ');
                const requestIdSuffix = ctx.requestId ? ` Request ID: ${ctx.requestId}` : '';

                console.error('[Agent] Terminating agent due to MCP connection failure');

                // Return error as italic text and stop
                yield {
                    type: 'text-delta',
                    text: `\n\n_Failed to connect to required tools: ${serverNames}. Error: ${errorMsg}.${requestIdSuffix}_\n\n`
                };
                yield { type: 'done' };
                return; // Stop execution
            }
        } else {
            console.log('[Agent] No MCP servers configured for this activity');
        }

        console.log('[Agent] All tools for activity', activity.id + ':', Object.keys({ ...localTools, ...mcpTools }));

        const allTools = { ...localTools, ...mcpTools };

        // Apply activity-specific message history limits
        const maxBytes = activity.maxHistoryBytes ?? 30000; // Default ~7-8k tokens
        const maxMessages = activity.maxHistoryMessages ?? 0; // Default no message limit

        console.log(`[Agent] Message history limits: maxBytes=${maxBytes}, maxMessages=${maxMessages}`);

        const recentMessages = truncateMessages(messages, maxBytes, maxMessages);

        if (messages.length !== recentMessages.length) {
            console.log(`[Agent] Truncated conversation: ${messages.length} -> ${recentMessages.length} messages`);
        }

        // Convert messages to AI SDK format
        const coreMessages = convertToCoreMessages(recentMessages);
        console.log('[Agent] Processing', coreMessages.length, 'messages');

        // Format memory for prompt injection if memory tool is enabled
        const formattedMemory = activity.localTools.includes('memory')
            ? formatMemoryForPrompt(memoryState, userId)
            : undefined;

        console.log('[Agent] Formatted memory for prompt:', formattedMemory);

        // Build template context from available user data
        const templateContext = buildTemplateContext(
            userId,
            userIp,
            userCountry,
            userTimezone,
            userLocale,
            formattedMemory
        );

        // Process template tags in system prompt
        const processedSystemPrompt = processTemplate(activity.systemPrompt, templateContext);

        // Add standard message handling instructions
        const enhancedSystemPrompt = `${processedSystemPrompt}

IMPORTANT INSTRUCTIONS FOR MESSAGE HANDLING:
- The conversation history is provided in the messages array
- The LAST message in the array is ALWAYS the current user's input that you need to respond to
- Previous messages provide context but focus your response on addressing the latest user message
- When you see tool results, they are responses to YOUR previous tool calls, not new user requests`;

        // Log snippet of system prompt for debugging
        console.log('[Agent] System prompt length:', enhancedSystemPrompt.length, 'chars');
        console.log('[Agent] System prompt start:', enhancedSystemPrompt.substring(0, 150).replace(/\n/g, ' '));
        console.log('[Agent] Number of messages:', coreMessages.length);
        console.log('[Agent] Number of tools:', Object.keys(allTools).length);

        // Estimate token usage
        const estimatedPromptTokens = Math.ceil(enhancedSystemPrompt.length / 4) +
                                      coreMessages.reduce((sum, msg) => {
                                        const content = Array.isArray(msg.content)
                                          ? msg.content.map(c => c.type === 'text' ? c.text : '').join(' ')
                                          : String(msg.content);
                                        return sum + Math.ceil(content.length / 4);
                                      }, 0);
        console.log('[Agent] Estimated prompt tokens:', estimatedPromptTokens, '(rough estimate)');

        if (estimatedPromptTokens > 1500) {
          console.warn('[Agent] Large prompt detected! This may cause empty responses.');
          console.warn('[Agent]     System prompt: ~', Math.ceil(enhancedSystemPrompt.length / 4), 'tokens');
          console.warn('[Agent]     Messages: ~', estimatedPromptTokens - Math.ceil(enhancedSystemPrompt.length / 4), 'tokens');
          console.warn('[Agent]     Tools:', Object.keys(allTools).length, 'tools');
        }

        // Debug logging - log the full prompt structure
        if (process.env.DEBUG_PROMPTS === 'true') {
            // console.log('[Template] Raw system prompt:', activity.systemPrompt);
            console.log('[Template] Context:', templateContext);
            console.log('\nFINAL SYSTEM PROMPT:');
            console.log(enhancedSystemPrompt);
            console.log('\nMESSAGES ARRAY:');
            coreMessages.forEach((msg, idx) => {
                console.log(`\n[Message ${idx + 1}] Role: ${msg.role}`);
                if (Array.isArray(msg.content)) {
                    msg.content.forEach((part, partIdx) => {
                        if (part.type === 'text') {
                            console.log(`  [Part ${partIdx + 1}] Text: ${part.text.substring(0, 2000)}${part.text.length > 2000 ? '...' : ''}`);
                        } else {
                            console.log(`  [Part ${partIdx + 1}] Type: ${part.type}`);
                        }
                    });
                } else {
                    console.log(`  Content: ${typeof msg.content === 'string' ? msg.content.substring(0, 2000) : JSON.stringify(msg.content).substring(0, 2000)}`);
                }
            });
        }

        // Track tool call history to prevent infinite loops (if enabled)
        const toolCallHistory: Array<{ toolName: string; args: string }> = [];

        // Run the agent loop with streaming
        const result = streamText({
            model,
            system: enhancedSystemPrompt,
            messages: coreMessages,
            tools: allTools,
            maxSteps: 10, // Allow up to 10 tool calls
            onStepFinish: ({ toolCalls, toolResults, text, finishReason, response }) => {
                // Log tool usage for debugging
                if (toolCalls?.length) {
                    console.log('[Agent] Tool calls:', toolCalls.map((t: any) => t.toolName));

                    // Check for duplicate tool calls (hallucination guard) - only if retry is enabled
                    if (ENABLE_TOOL_RETRY) {
                        for (const tc of toolCalls as any[]) {
                            // Count how many times we've seen this exact call
                            const previousCalls = toolCallHistory.filter(h =>
                                h.toolName === tc.toolName && h.args === JSON.stringify(tc.args)
                            );

                            if (previousCalls.length >= MAX_TOOL_RETRIES) {
                                console.warn(`[Agent] ⚠️  HALLUCINATION DETECTED: Tool ${tc.toolName} called ${previousCalls.length + 1} times with identical arguments`);
                                console.warn(`[Agent] Arguments:`, JSON.stringify(tc.args, null, 2));
                                console.warn(`[Agent] The LLM is repeating itself - maxSteps limit will stop this`);
                            }

                            // Record this call
                            toolCallHistory.push({
                                toolName: tc.toolName,
                                args: JSON.stringify(tc.args)
                            });
                        }
                    }

                    if (process.env.DEBUG_PROMPTS === 'true') {
                        toolCalls.forEach((tc: any) => {
                            console.log(`  Tool: ${tc.toolName}, Args:`, JSON.stringify(tc.args, null, 2));
                        });
                    }
                }

                // Log tool results to see if errors are being returned
                if (toolResults?.length) {
                    toolResults.forEach((tr: any) => {
                        const resultStr = JSON.stringify(tr.result, null, 2);

                        if (process.env.DEBUG_PROMPTS === 'true') {
                            console.log(`[Agent] Tool ${tr.toolName} result:`, resultStr.substring(0, 500));
                        }

                        // Check if result contains an error message
                        if (resultStr.includes('Error executing tool') || resultStr.includes('Tool execution failed') || resultStr.includes('Error:')) {
                            console.log(`[Agent]    Tool ${tr.toolName} returned error - LLM will see this and may retry`);
                        }
                    });
                }
                console.log('[Agent] Step finished. Current text length:', text.length, 'Finish reason:', finishReason || 'none');

                // Log response metadata for troubleshooting
                if (response) {
                    console.log('[Agent] Response metadata:', {
                        id: response.id,
                        modelId: response.modelId,
                        timestamp: response.timestamp ? new Date(response.timestamp).toISOString() : undefined,
                    });
                }
            },
        });

        let charCount = 0;
        let reasoningText = '';
        let hasContent = false;
        let totalTextLength = 0;
        const debugLLM = process.env.DEBUG_PROMPTS === 'true';

        // Stream the response - use fullStream to get all events
        try {
            for await (const part of result.fullStream) {
                if (part.type === 'text-delta') {
                    hasContent = true;
                    totalTextLength += part.textDelta.length;
                    charCount += part.textDelta.length;
                    yield { type: 'text-delta', text: part.textDelta };
                } else if (part.type === 'reasoning') {
                    // Extended thinking models emit reasoning content
                    reasoningText += part.textDelta;
                    yield { type: 'reasoning', text: part.textDelta };
                } else if (part.type === 'error') {
                    console.error('[Agent] Stream error:', part.error);
                    const requestIdSuffix = ctx.requestId ? ` Request ID: ${ctx.requestId}` : '';
                    const userFriendlyMsg = getUserFriendlyError(part.error);
                    yield {
                        type: 'text-delta',
                        text: `\n\n${userFriendlyMsg}${requestIdSuffix ? ` (${requestIdSuffix})` : ''}\n\n`
                    };
                } else if (part.type === 'finish') {
                    console.log('[Agent] Stream finished. Finish reason:', part.finishReason);
                    console.log('[Agent] Total text generated:', totalTextLength, 'characters');
                    console.log('[Agent] Had content:', hasContent);
                    console.log('[Agent] Finish metadata:', {
                        finishReason: part.finishReason,
                        usage: part.usage,
                        experimental_providerMetadata: part.experimental_providerMetadata,
                    });

                    // Log detailed error info if finish reason is error
                    if (part.finishReason === 'error') {
                        console.error('[Agent] ❌ Stream finished with error');
                        console.error('[Agent] Full part object:', JSON.stringify(part, null, 2));
                        console.error('[Agent] Provider metadata:', part.experimental_providerMetadata);

                        // Check for response in part object
                        if ((part as any).response) {
                            console.error('[Agent] Response object:', JSON.stringify((part as any).response, null, 2));
                        }

                        // Check for error field
                        if ((part as any).error) {
                            console.error('[Agent] Error field:', (part as any).error);
                        }
                    }

                    // Log if we got no content
                    if (!hasContent || totalTextLength === 0) {
                        console.warn('[Agent] Zero len output, finish reason:', part.finishReason);
                        console.warn('[Agent] Request ID:', ctx.requestId);

                        // Surface empty response with technical details
                        const requestIdSuffix = ctx.requestId ? ` Request ID: ${ctx.requestId}` : '';
                        yield {
                            type: 'text-delta',
                            text: `\n\n_The AI model returned no content. Finish reason: ${part.finishReason}.${requestIdSuffix}_\n\n`
                        };
                    }
                }
            }
        } catch (streamError) {
            console.error('[Agent] Error in stream:', streamError);
            if (streamError instanceof Error && streamError.stack) {
                console.error('[Agent] Stack trace:', streamError.stack);
            }
            const requestIdSuffix = ctx.requestId ? ` Request ID: ${ctx.requestId}` : '';
            const userFriendlyMsg = getUserFriendlyError(streamError);
            yield { type: 'text-delta', text: `\n\n${userFriendlyMsg}${requestIdSuffix ? ` (${requestIdSuffix})` : ''}\n\n` };
        }

        console.log('[Agent] Stream complete. Total characters:', charCount);

        // Send updated memory state back to client
        // Only send if memory tool was used and state has changed
        if (activity.localTools.includes('memory')) {
            console.log('[Agent] Sending memory update:', Object.keys(memoryState));
            yield {
                type: 'memory-update',
                memoryState,
            };
        }

        // Signal completion (keep MCP connections alive for reuse)
        yield { type: 'done' };
    } catch (error) {
        console.error('[Agent] Error in runAgentStream:', error);
        if (error instanceof Error && error.stack) {
            console.error('[Agent] Stack trace:', error.stack);
        }
        const requestIdSuffix = ctx.requestId ? ` Request ID: ${ctx.requestId}` : '';
        const userFriendlyMsg = getUserFriendlyError(error);
        yield { type: 'text-delta', text: `\n\n${userFriendlyMsg}${requestIdSuffix ? ` (${requestIdSuffix})` : ''}\n\n` };
        yield { type: 'done' };
    }
}
