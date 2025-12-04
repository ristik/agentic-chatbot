import { streamText, type CoreMessage } from 'ai';
import { createLLMProvider } from './llm/providers.js';
import { processTemplate, buildTemplateContext } from './llm/prompt-templates.js';
import { createMemoryTool, formatMemoryForPrompt, type ToolContext } from './tools/memory.js';
import { globalMcpManager } from './mcp/manager.js';
import type { ActivityConfig, ChatMessage } from '@agentic/shared';

export interface AgentContext {
    activity: ActivityConfig;
    userId: string;
    messages: ChatMessage[];
    userIp?: string;
    userCountry?: string;
    userTimezone?: string;
    userLocale?: string;
    memoryState?: Record<string, any>; // Initial memory state from client
}

function getUserFriendlyError(error: unknown): string {
    const errorStr = error instanceof Error ? error.message : String(error);

    // API errors
    if (errorStr.includes('API key') || errorStr.includes('GOOGLE_API_KEY')) {
        return '_Sorry, there\'s a configuration issue. Please contact support._';
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
 * Truncates messages to stay within a safe character limit (proxy for tokens).
 * Always keeps the last message (current user input).
 * Removes messages from the beginning of the history if limit is exceeded.
 */
function truncateMessages(messages: ChatMessage[], maxChars: number = 30000): ChatMessage[] {
    if (messages.length === 0) return [];

    // Always keep the last message
    const lastMessage = messages[messages.length - 1];
    const otherMessages = messages.slice(0, -1);

    let currentChars = JSON.stringify(lastMessage).length;
    const keptMessages: ChatMessage[] = [lastMessage];

    // Add messages from the end (most recent) to the beginning
    for (let i = otherMessages.length - 1; i >= 0; i--) {
        const msg = otherMessages[i];
        const msgSize = JSON.stringify(msg).length;

        if (currentChars + msgSize > maxChars) {
            console.log(`[Agent] Truncating history. Reached limit of ${maxChars} chars.`);
            break;
        }

        currentChars += msgSize;
        keptMessages.unshift(msg);
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
            model = createLLMProvider(activity.llm);
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
        try {
            console.log('[Agent] Connecting to MCP servers:', activity.mcpServers.map(s => s.name));
            await globalMcpManager.connect(activity.mcpServers);

            // Get tools only from servers configured for this activity
            // Pass user metadata (IP, country) for geolocation-based features
            const allowedServerNames = activity.mcpServers.map(s => s.name);
            mcpTools = await globalMcpManager.getTools(allowedServerNames, { userId, userIp, userCountry });
            console.log('[Agent] MCP tools loaded:', Object.keys(mcpTools));
        } catch (error) {
            console.error('[Agent] Failed to load MCP tools:', error);
            console.error('[Agent] This may cause the agent to fail if tools are required');
            // Don't throw - allow agent to continue without MCP tools if needed
            // But log prominently so we know this happened
        }

        console.log('[Agent] All tools for activity', activity.id + ':', Object.keys({ ...localTools, ...mcpTools }));

        const allTools = { ...localTools, ...mcpTools };

        // Apply intelligent truncation instead of fixed window
        const recentMessages = truncateMessages(messages, 30000); // ~7-8k tokens

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
                            console.log(`  [Part ${partIdx + 1}] Text: ${part.text.substring(0, 200)}${part.text.length > 200 ? '...' : ''}`);
                        } else {
                            console.log(`  [Part ${partIdx + 1}] Type: ${part.type}`);
                        }
                    });
                } else {
                    console.log(`  Content: ${typeof msg.content === 'string' ? msg.content.substring(0, 200) : JSON.stringify(msg.content).substring(0, 200)}`);
                }
            });
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
                    console.log('[Agent] Tool calls:', toolCalls.map((t: any) => t.toolName));
                    if (process.env.DEBUG_PROMPTS === 'true') {
                        toolCalls.forEach((tc: any) => {
                            console.log(`  Tool: ${tc.toolName}, Args:`, JSON.stringify(tc.args, null, 2));
                        });
                    }
                }
                if (toolResults?.length && process.env.DEBUG_PROMPTS === 'true') {
                    console.log('[Agent] Tool results:');
                    toolResults.forEach((tr: any) => {
                        console.log(`  Tool: ${tr.toolName}, Result:`, JSON.stringify(tr.result, null, 2).substring(0, 500));
                    });
                }
                console.log('[Agent] Step finished. Current text length:', text.length, 'Finish reason:', finishReason || 'none');
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
                    // Send user-friendly error message with root cause
                    const errorMsg = getUserFriendlyError(part.error);
                    const rootCause = part.error instanceof Error ? part.error.message : String(part.error);
                    yield { type: 'text-delta', text: `\n\n${errorMsg}\n\n_Root cause: ${rootCause}_\n\n` };
                } else if (part.type === 'finish') {
                    console.log('[Agent] Stream finished. Finish reason:', part.finishReason);
                    console.log('[Agent] Total text generated:', totalTextLength, 'characters');
                    console.log('[Agent] Had content:', hasContent);

                    // CRITICAL: Log if we got no content
                    if (!hasContent || totalTextLength === 0) {
                        console.warn('[Agent] ⚠️  WARNING: LLM returned zero text content!');
                        console.warn('[Agent] Finish reason:', part.finishReason);
                        console.warn('[Agent] This indicates a potential issue with:');
                        console.warn('[Agent]   - System prompt formatting');
                        console.warn('[Agent]   - LLM API issues');
                        console.warn('[Agent]   - Safety filters');
                        console.warn('[Agent]   - Tool loading failures');

                        // If we finished without content and it wasn't a tool call (which might be valid intermediate state),
                        // send an error to the user.
                        // Note: streamText handles tool calls internally, so 'finish' here usually means the FINAL response.
                        // However, if the last step was a tool call that didn't generate text, that might be okay?
                        // Actually streamText 'finish' event is for the whole generation.

                        if (part.finishReason !== 'stop' && part.finishReason !== 'length') {
                             // If it's not a normal stop, it might be an error or filter
                             yield { type: 'text-delta', text: `\n\n_The AI response was empty or filtered. (Reason: ${part.finishReason})_\n` };
                        }
                    }

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
            const rootCause = streamError instanceof Error ? streamError.message : String(streamError);
            yield { type: 'text-delta', text: `\n\n${errorMsg}\n\n_Root cause: ${rootCause}_\n\n` };
        }

        console.log('[Agent] Stream complete. Total characters:', charCount);
        if (charCount === 0) {
            console.error('[Agent] ❌ CRITICAL: Stream completed with ZERO characters output');
            console.error('[Agent] Check logs above for provider errors, MCP tool failures, or prompt issues');
        }

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
        const errorMsg = getUserFriendlyError(error);
        const rootCause = error instanceof Error ? error.message : String(error);
        yield { type: 'text-delta', text: `\n\n${errorMsg}\n\n_Root cause: ${rootCause}_\n\n` };
        yield { type: 'done' };
    }
}
