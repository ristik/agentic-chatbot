import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@agentic/shared';
import { MessageBubble } from './MessageBubble';

interface Props {
    messages: ChatMessage[];
}

export function MessageList({ messages }: Props) {
    const endOfMessagesRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    if (messages.length === 0) {
        return (
            <div className="text-center text-gray-400 py-8">
                Start a conversation...
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={endOfMessagesRef} />
        </div>
    );
}
