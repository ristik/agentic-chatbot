import { useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import type { ChatMessage } from '@agentic/shared';
import { generateUUID } from '../utils/uuid';
import { loadMemory, saveMemory, isLocalStorageAvailable } from '../utils/memory';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function useChat() {
    const {
        currentActivityId,
        isStreaming,
        currentStatus,
        addMessage,
        appendToLastMessage,
        appendThinkingToLastMessage,
        setStreaming,
        setStatus,
        getCurrentMessages,
    } = useChatStore();

    const getUserContext = useCallback((userId: string) => {
        try {
            return {
                userId,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                locale: navigator.language,
            };
        } catch (e) {
            console.warn('Could not detect user context:', e);
            return { userId };
        }
    }, []);

    const sendMessage = useCallback(async (text: string) => {
        if (!currentActivityId || isStreaming) return;

        const userId = localStorage.getItem('userId') || 'anonymous';
        const messages = getCurrentMessages();

        // Load current memory state from localStorage
        const memoryState = isLocalStorageAvailable()
            ? loadMemory(userId, currentActivityId)
            : {};

        // Add user message
        const userMessage: ChatMessage = {
            id: generateUUID(),
            role: 'user',
            content: [{ type: 'text', text }],
            timestamp: Date.now(),
        };
        addMessage(userMessage);

        // Create placeholder for assistant response
        const assistantMessage: ChatMessage = {
            id: generateUUID(),
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
                    userContext: getUserContext(userId),
                    memoryState, // Send localStorage data to backend
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
                                setStatus(null); // Clear status when text starts
                                appendToLastMessage(data.text);
                            } else if (data.type === 'reasoning') {
                                setStatus('Thinking...');
                                appendThinkingToLastMessage(data.text);
                            } else if (data.type === 'tool-call') {
                                const toolName = data.toolName?.replace(/_/g, ' ') || 'tool';
                                setStatus(`Using ${toolName}...`);
                            } else if (data.type === 'memory-update') {
                                // Handle memory updates from backend
                                if (isLocalStorageAvailable() && data.memoryState) {
                                    saveMemory(userId, currentActivityId, data.memoryState);
                                }
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
            setStatus(null);
        }
    }, [currentActivityId, isStreaming, getCurrentMessages, addMessage, appendToLastMessage, appendThinkingToLastMessage, setStreaming, setStatus]);

    return {
        messages: getCurrentMessages(),
        isStreaming,
        currentStatus,
        sendMessage,
    };
}
