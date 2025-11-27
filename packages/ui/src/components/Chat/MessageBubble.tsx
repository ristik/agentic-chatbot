import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '@agentic/shared';

interface Props {
    message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
    const [showThinking, setShowThinking] = useState(false);
    const isUser = message.role === 'user';

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 ${isUser
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
            >
                {message.content.map((content, idx) => {
                    switch (content.type) {
                        case 'text':
                            return (
                                <div key={idx} className="prose prose-sm max-w-none">
                                    <ReactMarkdown>{content.text}</ReactMarkdown>
                                </div>
                            );
                        case 'thinking':
                            return (
                                <details key={idx} className="mb-2">
                                    <summary
                                        className="cursor-pointer text-sm text-gray-600 hover:text-gray-800 font-medium"
                                        onClick={() => setShowThinking(!showThinking)}
                                    >
                                        💭 Thinking process {showThinking ? '▼' : '▶'}
                                    </summary>
                                    <div className="mt-2 p-3 bg-gray-50 rounded border border-gray-200 text-xs text-gray-700">
                                        <ReactMarkdown>{content.text}</ReactMarkdown>
                                    </div>
                                </details>
                            );
                        case 'image':
                            return (
                                <img
                                    key={idx}
                                    src={content.url}
                                    alt={content.alt || 'Image'}
                                    className="max-w-full rounded-lg"
                                />
                            );
                        case 'choice':
                            return (
                                <div key={idx} className="space-y-2">
                                    <p>{content.question}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {content.options.map((opt) => (
                                            <button
                                                key={opt.id}
                                                className="px-3 py-1 bg-white text-indigo-600 rounded-full text-sm hover:bg-indigo-50"
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        default:
                            return null;
                    }
                })}
            </div>
        </div>
    );
}
