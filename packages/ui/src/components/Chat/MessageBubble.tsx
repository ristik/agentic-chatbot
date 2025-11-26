import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '@agentic/shared';

interface Props {
    message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
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
