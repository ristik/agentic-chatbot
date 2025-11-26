import { useEffect, useState } from 'react';

export function MockWallet() {
    const [userId, setUserId] = useState<string>('');

    useEffect(() => {
        let id = localStorage.getItem('userId');
        if (!id) {
            id = `user_${crypto.randomUUID().slice(0, 8)}`;
            localStorage.setItem('userId', id);
        }
        setUserId(id);
    }, []);

    const regenerate = () => {
        const newId = `user_${crypto.randomUUID().slice(0, 8)}`;
        localStorage.setItem('userId', newId);
        setUserId(newId);
        window.location.reload();
    };

    return (
        <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">Mock Wallet</div>
            <div className="font-mono text-sm truncate">{userId}</div>
            <button
                onClick={regenerate}
                className="mt-2 text-xs text-indigo-600 hover:underline"
            >
                New Identity
            </button>
        </div>
    );
}
