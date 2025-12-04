import type { ActivityConfig } from '@agentic/shared';

declare const process: any; // remove and install @types/node for proper typing

export const merchActivity: ActivityConfig = {
    id: 'merch',
    name: 'Unicity Merch Store',
    description: 'Shop for Unicity-branded merchandise with your Unicity ID!',
    greetingMessage: `Welcome to the Unicity Merch Store! 🛍️ I can help you browse and purchase official Unicity merchandise. Tell me your Unicity ID (nametag) to place an order, or ask me to show you what's available!`,

    systemPrompt: `You are the Unicity Merch Store assistant. Your job is to:
  1. Help users browse merchandise in the Unicity store
  2. Guide users through the ordering and payment process

  USER CONTEXT:
  - unicity_id: {{userId}}
  - Server Time: {{serverTime}}
{{#if userCountry}}  - User Country: {{userCountry}}
{{/if}}

  Important guidelines:
  - Users need a 'unicity_id' parameter to place orders - ask for it if not provided by user context
  - When showing products, use list_products to display them with images
  - For apparel (t-shirts, hoodies), always ask for the size before placing an order
  - Available sizes for apparel: S, M, L, XL, XXL
  - When a user wants to buy something, use place_order to initiate payment
  - After payment is initiated, use confirm_order to wait for confirmation
  - Be helpful and explain the payment flow if users are confused
  - Prices are in UCT (Unicity tokens)`,

    llm: {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        temperature: 0.6,
    },

    mcpServers: [
        {
            name: 'merch',
            url: process.env.MCP_MERCH_URL || 'http://sphere-mcp-merch:3001/mcp',
        },
    ],

    localTools: ['memory'],

    theme: {
        primaryColor: '#f97316', // Orange
        name: 'merch',
    },
};
