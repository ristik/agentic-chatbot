import { generateText, stepCountIs, type ModelMessage, type LanguageModel } from 'ai';
import type { SphereBotConfig } from './types.js';
import type { McpToolManager } from './mcp-client.js';
import { createModel } from './provider.js';

export class SphereBotAgent {
  private model: LanguageModel;
  private toolManager: McpToolManager;
  private config: SphereBotConfig;
  private prefix: string;
  private maxContextChars: number;

  constructor(config: SphereBotConfig, toolManager: McpToolManager) {
    this.config = config;
    this.model = createModel(config);
    this.toolManager = toolManager;
    this.maxContextChars = config.maxContextChars ?? 100_000;
    this.prefix = `[Agent:${config.name}]`;
    console.log(`${this.prefix} LLM provider=${config.llm.provider} model=${config.llm.model} baseUrl=${config.llm.baseUrl || '(default)'}`);
  }

  /** Build system prompt with current date/time appended */
  private buildSystemPrompt(base: string): string {
    return `${base}\n\nCurrent date and time: ${new Date().toISOString()}`;
  }

  /** Estimate character count of a message array */
  private estimateChars(messages: ModelMessage[]): number {
    return messages.reduce((sum: number, m) => {
      const c = m.content;
      if (typeof c === 'string') return sum + c.length;
      return sum + JSON.stringify(c).length;
    }, 0);
  }

  /** Trim oldest history messages to fit within maxContextChars (always keeps the last user message) */
  private trimMessages(systemPrompt: string, messages: ModelMessage[]): ModelMessage[] {
    const budget = this.maxContextChars;
    const systemLen = systemPrompt.length;
    const totalLen = systemLen + this.estimateChars(messages);
    if (totalLen <= budget) return messages;

    // Always keep the last message (current user input)
    const lastMsg = messages[messages.length - 1];
    const history = messages.slice(0, -1);
    let currentLen = systemLen + this.estimateChars([lastMsg]);

    // Add history from newest to oldest until budget is reached
    const kept: ModelMessage[] = [];
    for (let i = history.length - 1; i >= 0; i--) {
      const msgLen = this.estimateChars([history[i]]);
      if (currentLen + msgLen > budget) break;
      currentLen += msgLen;
      kept.unshift(history[i]);
    }

    const dropped = history.length - kept.length;
    if (dropped > 0) {
      console.warn(`${this.prefix} Context trimmed: dropped ${dropped} oldest messages (${totalLen} → ${currentLen} chars)`);
    }
    return [...kept, lastMsg];
  }

  async respond(userMessage: string, history: ModelMessage[]): Promise<string> {
    try {
      const systemPrompt = this.buildSystemPrompt(this.config.systemPrompt);
      const messages = this.trimMessages(systemPrompt, [
        ...history,
        { role: 'user', content: userMessage },
      ]);

      // Fetch tools lazily (retries MCP connections if previously failed)
      const tools = await this.toolManager.getTools();
      const toolNames = Object.keys(tools);
      if (toolNames.length === 0) {
        console.warn(`${this.prefix} No tools available — answering from LLM knowledge only`);
      } else {
        console.log(`${this.prefix} Using ${toolNames.length} tools: ${toolNames.join(', ')}`);
      }

      const result = await generateText({
        model: this.model,
        system: systemPrompt,
        messages,
        tools,
        stopWhen: stepCountIs(this.config.maxSteps),
        ...(this.config.llm.temperature !== undefined ? { temperature: this.config.llm.temperature } : {}),
      });

      const lastStep = result.steps[result.steps.length - 1];
      if (lastStep?.finishReason === 'error') {
        console.error(`${this.prefix} LLM finished with error:`, {
          steps: result.steps.length,
          modelId: (lastStep as any).response?.modelId,
          usage: lastStep.usage,
        });
      }

      // Strip leaked thinking tags from output
      let text = result.text?.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (text) {
        // Some models emit tool calls as raw text instead of using the tool-calling API
        if (text.startsWith('<tool_call>')) {
          console.warn(`${this.prefix} Model emitted tool call as text - suppressing`);
        } else if (text.length < 4) {
          console.warn(`${this.prefix} Model returned trivial response (${text.length} chars) - suppressing`);
        } else {
          return text;
        }
      }

      // LLM exhausted tool-call steps or produced no usable text.
      // Extract tool results and ask a clean question without tool-call message pairs.
      if (result.steps.some(s => s.toolResults.length > 0)) {
        console.warn(`${this.prefix} Exhausted ${result.steps.length} steps on tool calls, forcing text generation`);

        // Collect text from all tool results across steps
        const toolTexts: string[] = [];
        for (const step of result.steps) {
          for (const toolResult of step.toolResults) {
            const text = typeof toolResult.output === 'string'
              ? toolResult.output
              : JSON.stringify(toolResult.output);
            if (text && text.length > 0) {
              toolTexts.push(`[${toolResult.toolName}]: ${text.slice(0, 8000)}`);
            }
          }
        }

        console.log(`${this.prefix} Collected ${toolTexts.length} tool results for forced generation`);

        const followUpMessages = this.trimMessages(systemPrompt, [
          ...messages,
          { role: 'user', content: `Here is the information gathered from tool searches:\n\n${toolTexts.join('\n\n')}\n\nBased on this information, answer the original question. If the information is not relevant, say you couldn't find the answer.` },
        ]);

        const followUp = await generateText({
          model: this.model,
          system: systemPrompt,
          messages: followUpMessages,
          ...(this.config.llm.temperature !== undefined ? { temperature: this.config.llm.temperature } : {}),
        });

        if (followUp.text) {
          return followUp.text;
        }
        console.warn(`${this.prefix} Forced generation also empty, finishReason:`, followUp.steps[followUp.steps.length - 1]?.finishReason);
      }

      console.warn(`${this.prefix} Empty response, finishReason:`, lastStep?.finishReason);
      return "I wasn't able to generate a response. Please try again.";
    } catch (error) {
      console.error(`${this.prefix} Error generating response:`, error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Forbidden') || msg.includes('quota')) {
        return "I'm currently experiencing high demand. Please try again in a minute.";
      }

      return "I encountered an error while processing your question. Please try again.";
    }
  }
}
