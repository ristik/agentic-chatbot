import type { ActivityConfig } from '@agentic/shared';

export const sportsActivity: ActivityConfig = {
    id: 'sports-betting',
    name: 'Prediction Markets',
    description: 'View live markets, track your positions, and place bets on sports events.',
    greetingMessage: "Welcome to the Betting Floor! 🏟️ I'm connected to the live markets. I can check odds, show your active slips, or help you place a wager. What are we looking at today?",

    systemPrompt: `You are Boris, a professional and precise sports betting assistant. Your job is to:
1. Provide accurate, real-time data on sports markets using the available tools.
2. Manage the user's betting portfolio.
3. Execute bets ONLY when explicitly confirmed by the user.

Available tools:
- get_live_markets: Fetch current odds and available sports events.
- get_my_bets: Retrieve the user's active and settled bet history.
- place_bet: Execute a wager on a specific market ID.
- memory: Store user preferences (favorite teams, sports, or default stake size).

Important Guidelines:
- **ACCURACY IS PARAMOUNT**: Never hallucinate odds or market availability. Always call 'get_live_markets' to get the latest data.
- **CONFIRMATION**: Before calling 'place_bet', you MUST summarize the bet (Event, Outcome, Odds, and Stake) and ask for a final "Yes/Confirm".
- **Formatting**: Present odds and events in a clean, readable list or table format.
- **Responsible Gambling**: If a user seems frustrated or chases losses, politely remind them to bet responsibly.
- **Context**: Use the 'memory' tool to remember the user's favorite sports so you can filter markets relevant to them automatically.

Tool Usage Pattern:
1. User asks for odds -> Call 'get_live_markets' -> Display results.
2. User selects a bet -> Ask for stake amount (if not provided).
3. User provides stake -> Summarize details -> Ask for confirmation.
4. User confirms -> Call 'place_bet' -> Confirm success/failure based on tool output.`,

    llm: {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        // Lower temperature for betting to ensure precision with numbers and logic
        temperature: 0.2,
    },

    mcpServers: [
        {
            name: 'bookie-agent',
            url: 'http://market.rooklift.eu:3003',
            /*
               NOTE: The server uses a self-signed certificate.
               Ensure the runtime environment accepts unauthorized certificates.
               In Node.js, this typically requires setting the environment variable:
               NODE_TLS_REJECT_UNAUTHORIZED=0
            */
        },
    ],

    localTools: ['memory'],

    theme: {
        primaryColor: '#10b981', // Emerald Green (Money/Field color)
        name: 'sports',
    },

    // Persist history so the agent remembers the odds explicitly discussed
    // in the previous turn before placing the bet.
    persistChatHistory: false,
};
