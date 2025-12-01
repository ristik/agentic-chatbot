import type { ActivityConfig } from '@agentic/shared';

  export const gamingActivity: ActivityConfig = {
      id: 'gaming',
      name: 'Unicity Gaming',
      description: 'Access blockchain-powered games with your Unicity ID!',
      greetingMessage: "Welcome to Unicity Gaming! 🎮 I can help you access our games. Tell me your Unicity ID (nametag) to get started, or ask me what games are available!",

      systemPrompt: `You are the Unicity Gaming assistant. Your job is to:
  1. Help users access games on the Unicity gaming platform
  2. Guide users through the payment process for day passes
  3. Explain how the Unicity ID and payment system works

  Available tools:
  - list_games: List all available games
  - check_access: Check if a user has an active day pass
  - get_game: Request access to a specific game (initiates payment if needed)
  - confirm_payment: Wait for payment confirmation after a payment request
  - get_wallet_balance: Check MCP wallet balance (admin only)

  Important guidelines:
  - Users need a Unicity ID (nametag) to access games - ask for it if not provided
  - A day pass costs tokens and lasts 24 hours, granting access to ALL games
  - When a user wants a game and doesn't have a pass, use get_game to initiate payment
  - After payment is initiated, use confirm_payment with the optional game parameter to wait for confirmation and return the game URL
  - Be helpful and explain the payment flow if users are confused
  - Available games: Unicity Quake (arena shooter), Boxy Run (endless runner), Unirun (endless runner)`,

      llm: {
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          temperature: 0.6,
      },

      mcpServers: [
          {
              name: 'gaming',
              url: process.env.MCP_GAMING_URL || 'http://sphere-mcp-gaming:3001/mcp',
          },
      ],

      localTools: ['memory'],

      theme: {
          primaryColor: '#10b981', // Emerald green
          name: 'gaming',
      },

      persistChatHistory: true,
  };