import { useState } from 'react';
import { useChat } from '../../hooks/useChat';
import { MessageList } from './MessageList';
import { InputBar } from './InputBar';

export function ChatContainer() {
    const { messages, isStreaming, sendMessage } = useChat();
    const [input, setInput] = useState('');

    const handleSubmit = () => {
        if (!input.trim() || isStreaming) return;
        sendMessage(input.trim());
        setInput('');
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4">
                <MessageList messages={messages} />
            </div>
            <InputBar
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                disabled={isStreaming}
            />
        </div>
    );
}
