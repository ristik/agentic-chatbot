import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage } from '@agentic/shared';

interface ChatState {
    // Per-activity message history
    messagesByActivity: Record<string, ChatMessage[]>;
    currentActivityId: string | null;
    isStreaming: boolean;

    // Actions
    setActivity: (activityId: string) => void;
    addMessage: (message: ChatMessage) => void;
    appendToLastMessage: (text: string) => void;
    setStreaming: (streaming: boolean) => void;
    clearActivity: (activityId: string) => void;

    // Getters
    getCurrentMessages: () => ChatMessage[];
}

export const useChatStore = create<ChatState>()(
    persist(
        (set, get) => ({
            messagesByActivity: {},
            currentActivityId: null,
            isStreaming: false,

            setActivity: (activityId) => set({ currentActivityId: activityId }),

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

            setStreaming: (streaming) => set({ isStreaming: streaming }),

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
        }),
        {
            name: 'chat-storage',
            partialize: (state) => ({ messagesByActivity: state.messagesByActivity }),
        }
    )
);
