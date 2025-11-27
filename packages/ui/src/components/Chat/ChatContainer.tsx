import { useState } from 'react';
import { useChat } from '../../hooks/useChat';
import { MessageList } from './MessageList';
import { InputBar } from './InputBar';

export function ChatContainer() {
    const { messages, isStreaming, currentStatus, sendMessage } = useChat();
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
                {currentStatus && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 mt-2 animate-pulse">
                        <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                        <span>{currentStatus}</span>
                    </div>
                )}
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
