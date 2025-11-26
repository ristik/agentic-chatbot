import { useEffect, useState } from 'react';
import { useChatStore } from '../stores/chatStore';

interface Activity {
    id: string;
    name: string;
    description: string;
    greetingMessage?: string;
    theme?: { primaryColor: string };
    persistChatHistory?: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function ActivitySelector() {
    const [activities, setActivities] = useState<Activity[]>([]);
    const { currentActivityId, setActivity, addMessage } = useChatStore();

    useEffect(() => {
        fetch(`${API_BASE}/activities`)
            .then((r) => r.json())
            .then((data) => setActivities(data.activities))
            .catch(console.error);
    }, []);

    const handleSelect = (activity: Activity) => {
        // If activity doesn't persist chat history, clear it first
        if (activity.persistChatHistory === false) {
            useChatStore.getState().clearActivity(activity.id);
        }

        setActivity(activity.id);

        // Add greeting if exists and no messages yet
        const messages = useChatStore.getState().messagesByActivity[activity.id];
        if (activity.greetingMessage && (!messages || messages.length === 0)) {
            addMessage({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: [{ type: 'text', text: activity.greetingMessage }],
                timestamp: Date.now(),
            });
        }
    };

    return (
        <div className="p-4">
            <h2 className="text-lg font-semibold mb-3">Choose an Activity</h2>
            <div className="flex flex-wrap gap-2">
                {activities.map((activity) => (
                    <button
                        key={activity.id}
                        onClick={() => handleSelect(activity)}
                        className={`px-4 py-2 rounded-lg transition-colors ${currentActivityId === activity.id
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                    >
                        {activity.name}
                    </button>
                ))}
            </div>
        </div>
    );
}
