import { ChatContainer } from './components/Chat/ChatContainer';
import { ActivitySelector } from './components/ActivitySelector';
import { MockWallet } from './components/MockWallet';
import { useChatStore } from './stores/chatStore';

function App() {
    const currentActivityId = useChatStore((s) => s.currentActivityId);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-4xl mx-auto p-4">
                <header className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold text-gray-900">Agentic Chat</h1>
                    <MockWallet />
                </header>

                <ActivitySelector />

                {currentActivityId ? (
                    <div className="h-[600px] mt-4">
                        <ChatContainer />
                    </div>
                ) : (
                    <div className="text-center py-12 text-gray-500">
                        Select an activity to start chatting
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
