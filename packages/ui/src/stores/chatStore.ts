import { create } from 'zustand';
import type { ChatMessage } from '@agentic/shared';

interface ChatState {
    // Per-activity message history
    messagesByActivity: Record<string, ChatMessage[]>;
    currentActivityId: string | null;
    isStreaming: boolean;
    currentStatus: string | null; // e.g., "Thinking...", "Using web_fetch tool..."

    // Actions
    setActivity: (activityId: string) => void;
    addMessage: (message: ChatMessage) => void;
    appendToLastMessage: (text: string) => void;
    appendThinkingToLastMessage: (text: string) => void;
    setStreaming: (streaming: boolean) => void;
    setStatus: (status: string | null) => void;
    clearActivity: (activityId: string) => void;

    // Getters
    getCurrentMessages: () => ChatMessage[];
}

// No persistence - each session starts fresh
export const useChatStore = create<ChatState>()((set, get) => ({
    messagesByActivity: {},
    currentActivityId: null,
    isStreaming: false,
    currentStatus: null,

    setActivity: (activityId) => set({
        currentActivityId: activityId,
        // Clear messages when switching activities to start fresh
        messagesByActivity: {
            ...get().messagesByActivity,
            [activityId]: [],
        },
    }),

    addMessage: (message) => set((state) => {
        const activityId = state.currentActivityId;
        if (!activityId) return state;

        const current = state.messagesByActivity[activityId] || [];
        return {
            messagesByActivity: {
                ...state.messagesByActivity,
                [activityId]: [...current, message],
            },
        };
    }),

    appendToLastMessage: (text) => set((state) => {
        const activityId = state.currentActivityId;
        if (!activityId) return state;

        const messages = [...(state.messagesByActivity[activityId] || [])];
        const lastMsg = messages[messages.length - 1];

        if (lastMsg && lastMsg.role === 'assistant') {
            const lastContent = lastMsg.content[lastMsg.content.length - 1];
            if (lastContent && lastContent.type === 'text') {
                lastContent.text += text;
            }
        }

        return {
            messagesByActivity: {
                ...state.messagesByActivity,
                [activityId]: messages,
            },
        };
    }),

    appendThinkingToLastMessage: (text) => set((state) => {
        const activityId = state.currentActivityId;
        if (!activityId) return state;

        const messages = [...(state.messagesByActivity[activityId] || [])];
        const lastMsg = messages[messages.length - 1];

        if (lastMsg && lastMsg.role === 'assistant') {
            // Find or create thinking content
            let thinkingContent = lastMsg.content.find(c => c.type === 'thinking');
            if (!thinkingContent) {
                thinkingContent = { type: 'thinking', text: '' };
                lastMsg.content.unshift(thinkingContent); // Add thinking before text
            }
            if (thinkingContent.type === 'thinking') {
                thinkingContent.text += text;
            }
        }

        return {
            messagesByActivity: {
                ...state.messagesByActivity,
                [activityId]: messages,
            },
        };
    }),

    setStreaming: (streaming) => set({ isStreaming: streaming }),

    setStatus: (status) => set({ currentStatus: status }),

    clearActivity: (activityId) => set((state) => ({
        messagesByActivity: {
            ...state.messagesByActivity,
            [activityId]: [],
        },
    })),

    getCurrentMessages: () => {
        const state = get();
        if (!state.currentActivityId) return [];
        return state.messagesByActivity[state.currentActivityId] || [];
    },
}));
