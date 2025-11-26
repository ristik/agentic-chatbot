import { useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import type { ChatMessage } from '@agentic/shared';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function useChat() {
    const {
        currentActivityId,
        isStreaming,
        addMessage,
        appendToLastMessage,
        setStreaming,
        getCurrentMessages,
    } = useChatStore();

    const sendMessage = useCallback(async (text: string) => {
        if (!currentActivityId || isStreaming) return;

        const userId = localStorage.getItem('userId') || 'anonymous';
        const messages = getCurrentMessages();

        // Add user message
        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: [{ type: 'text', text }],
            timestamp: Date.now(),
        };
        addMessage(userMessage);

        // Create placeholder for assistant response
        const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: [{ type: 'text', text: '' }],
            timestamp: Date.now(),
        };
        addMessage(assistantMessage);
        setStreaming(true);

        try {
            const response = await fetch(`${API_BASE}/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    activityId: currentActivityId,
                    userId,
                    messages: [...messages, userMessage],
                }),
            });

            if (!response.ok) throw new Error('Chat request failed');

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) throw new Error('No response body');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.type === 'text-delta') {
                                appendToLastMessage(data.text);
                            }
                        } catch {
                            // Ignore parse errors for incomplete chunks
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Chat error:', error);
            appendToLastMessage('\n\n_I encountered a connection issue. Please try again._');
        } finally {
            setStreaming(false);
        }
    }, [currentActivityId, isStreaming, getCurrentMessages, addMessage, appendToLastMessage, setStreaming]);

    return {
        messages: getCurrentMessages(),
        isStreaming,
        sendMessage,
    };
}
