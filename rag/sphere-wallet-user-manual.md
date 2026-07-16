# Sphere Wallet User Manual

Sphere is the official wallet and application for the Unicity ecosystem. It lets you create and manage a Unicity wallet, send and receive tokens on the L3 (Unicity state transition network), chat with other users via encrypted direct messages and group chats, interact with AI-powered marketplace agents, and connect to external dApps.

## Getting Started

### Creating a New Wallet

1. Open Sphere and click **Create New Wallet** on the welcome screen.
2. You will be asked to choose a **Unicity ID** (also called a nametag). This is a human-readable username (like `@alice`) that other users can use to send you tokens or messages. Enter a name and wait for the availability check (a green checkmark means it's available). You can also skip this step and register a nametag later.
3. Your wallet is created. A 12-word **recovery phrase** (seed phrase) is generated — **back this up immediately** and store it in a safe place. Anyone with this phrase can restore your wallet and access your funds.
4. You're now on the main dashboard with your wallet ready to use.

### Restoring a Wallet

If you already have a Unicity wallet, you can restore it:

- **From Recovery Phrase**: Click **Restore Wallet**, choose **Recovery Phrase**, and enter your 12-word seed phrase. If your wallet had multiple addresses, you'll be shown an address selection screen where you can choose which addresses to import.
- **From File**: Click **Restore Wallet**, choose **Import from File**, and upload a `.json`, `.dat`, or `.txt` wallet backup file. If the file is encrypted, you'll be prompted for the password.

After restoring, you can register a new Unicity ID or keep an existing one if it was recovered.

## Wallet Overview

The wallet panel is always visible on the right side of the screen (desktop) or accessible via the **Wallet** tab (mobile).

### Balance Display

At the top of the wallet panel you see your total portfolio balance in USD. Click the **eye icon** to hide or show your balances (this preference is remembered).

### Your Identity

The **address selector** at the top of the wallet panel shows your current Unicity ID and address. Click it to:
- **Copy** your address to the clipboard.
- **Switch** between multiple addresses if you have derived more than one.
- **Create a new address** by clicking the **New** button — this derives the next HD address and optionally lets you assign a Unicity ID to it.

If you haven't registered a Unicity ID yet, a **Register ID** button appears in the wallet header. Click it to choose and mint a nametag on-chain.

### Action Buttons

Below your balance are three action buttons:
- **Top Up** — Get tokens from the testnet faucet or create a payment request.
- **Swap** — Exchange one token type for another.
- **Send** — Send L3 tokens to another user.

### Assets and Tokens Tabs

Two tabs let you view your holdings in different ways:
- **Assets** — Groups your tokens by coin type. Shows the total amount, USD value, and 24-hour price change for each asset.
- **Tokens** — Shows individual token units, sorted by newest first.

## Sending Tokens (L3)

1. Click **Send** in the wallet panel.
2. **Enter recipient**: Type a Unicity ID (like `@bob`) or toggle to "Direct Address" mode and paste a `DIRECT://...` address. The recipient is validated in real time.
3. **Select asset**: Choose which token type to send from your available assets.
4. **Enter amount**: Type the amount to send. Click **MAX** to send your entire balance of that token. Optionally add a memo message.
5. **Confirm**: Review the summary showing amount, asset, and recipient. Click **Confirm & Send**.
6. Wait for the transaction to be processed. You'll see a success confirmation when complete.

Sphere uses "smart transfer" — it automatically splits tokens if needed to send the exact amount you specified.

## Receiving Tokens (L3)

Tokens sent to your Unicity ID or direct address arrive automatically. When you receive tokens:
- A notification appears in the wallet panel.
- The new tokens animate into your asset/token list.
- The transfer shows up in your transaction history.

To receive tokens, share your **Unicity ID** (e.g., `@alice`) or your **Direct Address** with the sender. You can find and copy these from the address selector dropdown or from **Settings > My Public Keys**.

## Payment Requests

### Sending a Payment Request

You can ask someone to pay you a specific amount:
1. Go to **Top Up > Payment Request** or use the payment request feature in an agent chat.
2. Enter the recipient's Unicity ID or address.
3. Select the coin and enter the amount.
4. Optionally add a message explaining what the payment is for.
5. Click **Send Request**. The recipient will be notified.

### Receiving a Payment Request

When someone sends you a payment request:
- A **red badge** appears on the bell icon in the wallet header.
- The payment request modal opens showing the request details: who sent it, the amount, and any message.
- Click **Pay Now** to send the requested amount immediately, or **Decline** to reject the request.
- Processed requests (paid or declined) can be cleared from the history.

## Swapping Tokens

1. Click **Swap** in the wallet panel.
2. Select the token you want to swap **from** and enter the amount.
3. Select the token you want to swap **to**.
4. The exchange rate is displayed live.
5. Click **Swap Tokens** to execute the trade.

## Top Up (Testnet Faucet)

On testnet, you can get free tokens:
1. Click **Top Up** in the wallet panel.
2. On the **Faucet** tab, click **Request All Coins**.
3. You'll receive a set of test tokens in various denominations.

Note: You must have a registered Unicity ID to use the faucet.

## Direct Messages (DM Chat)

Sphere includes end-to-end encrypted direct messaging built on the Nostr protocol (NIP-17).

### Starting a Conversation

1. Select the **Chat** agent from the agent grid.
2. Click the **+** button (new conversation) in the sidebar.
3. Enter the recipient's Unicity ID or public key.
4. Start typing your message in the input field and press Enter or click Send.

### Chat Features

- **Conversation list**: The left sidebar shows all your conversations, sorted by most recent. A search bar lets you filter by nametag.
- **Typing indicator**: Shows when the other person is typing.
- **Message history**: Scroll up to load older messages.
- **@mentions**: Click on an @mention in a message to open a new DM with that user.
- **Fullscreen mode**: Click the expand icon to make the chat take up the full screen. Press Escape to exit.

### Mini Chat Bubbles (Desktop)

On desktop, a floating chat icon appears in the bottom-left corner of the screen on all pages. It shows:
- An unread message count badge.
- Up to 5 conversation bubbles for your most recent chats.
- Click a bubble to open a mini chat window without leaving your current page.

## Group Chat

Sphere supports group messaging through NIP-29 relay-based groups.

### Joining a Group

1. In the Chat section, switch to the **Global** tab using the mode toggle.
2. Click **Browse Groups** to see available groups.
3. Click **Join** on any group you want to participate in.
4. You can also join a group via an invite link shared by someone else.

### Group Chat Features

- **Member list**: Click the member count in the group header to see all members.
- **Reply to messages**: Hover over a message and click the reply button to create a threaded reply.
- **@mentions**: Mention other group members; clicking a mention opens a DM with them.
- **Moderation**: Group admins and moderators can delete messages and kick members.
- **Leave group**: Right-click or use the menu on a group in the sidebar to leave.

### Creating a Group

Group creation is available to relay administrators. Click **Create Group**, enter a name and description, and the group is created on the relay.

## IPFS Sync

Sphere can sync your token data to IPFS for backup and cross-device access.

- The **cloud icon** in the header shows your IPFS sync status:
  - **Green cloud**: Synced successfully.
  - **Orange spinner**: Sync in progress.
  - **Gray cloud-off**: IPFS sync is disabled.
  - **Red dot**: Sync error (hover for details).
- **Click the icon** to toggle IPFS sync on or off. This preference persists across sessions.

When enabled, your token data is automatically synced to IPFS after changes. When you restore a wallet on a new device, your tokens can be recovered from IPFS.

## Settings

Access settings by clicking the **three-dot menu** icon in the wallet header.

### My Public Keys

Displays all your identity keys and addresses:
- **Unicity ID** (`@nametag`)
- **Direct Address** (`DIRECT://...`) — your L3 address for receiving tokens
- **Proxy Address** — alternative L3 address format
- **Chain Pubkey** — 33-byte compressed secp256k1 public key
- **Transport Pubkey** — Nostr transport key for messaging

Each field has a copy button. There is also a **Lookup** feature where you can search for any user by their Unicity ID or direct address to see all their associated addresses.

### Backup Wallet

Two backup options:
- **Export Wallet File** — Downloads an encrypted JSON file of your wallet. You can set a password for encryption.
- **Show Recovery Phrase** — Displays your 12-word seed phrase. Write this down and store it securely.

### Logout

Logging out deletes all wallet data from your browser. You will be prompted to backup first:
- **Backup & Logout** — Opens the backup screen before clearing data.
- **Logout Without Backup** — Immediately clears all data. Make sure you have your recovery phrase saved before using this option.

## dApp Connect

External applications can connect to your Sphere wallet through the dApp Connect feature.

When an external dApp requests a connection:
1. A popup window opens showing the dApp's name and the permissions it is requesting.
2. Click **Approve** to allow the connection or **Deny** to reject it.
3. Once connected, the dApp can request transactions (sends, payment requests) which open pre-filled in your wallet for your confirmation.

Approved connections are remembered per website so you won't be prompted again for the same dApp.

## Tips and Best Practices

- **Back up your recovery phrase** immediately after creating a wallet. Store it offline in a secure location. Never share it with anyone.
- **Register a Unicity ID** to make it easy for others to send you tokens and messages. It's much easier to share `@alice` than a long address.
- **Enable IPFS sync** to back up your token data across devices.
- **Use the address selector** if you need separate addresses for different purposes — each derived address can have its own Unicity ID.
- **Check payment requests** regularly — the red bell badge indicates pending requests that need your attention.
- **Export a wallet backup** periodically, especially before logging out or clearing browser data.

## Keyboard Shortcuts

- **Enter** — Send a message in chat.
- **Escape** — Exit fullscreen chat mode.

## Glossary

- **Unicity ID / Nametag**: A human-readable username (e.g., `@alice`) registered on-chain. Used for receiving payments and messages.
- **L3 (Layer 3)**: The Unicity state transition network — a token transfer layer with state proofs.
- **Direct Address**: An L3 address in `DIRECT://...` format used for receiving L3 tokens.
- **Recovery Phrase / Seed Phrase**: A 12-word mnemonic that can restore your entire wallet. Keep it secret and safe.
- **HD Wallet**: Hierarchical Deterministic wallet — a single recovery phrase can derive multiple addresses.
- **IPFS**: InterPlanetary File System — a decentralized storage network used for token data backup.
- **Nostr**: A decentralized messaging protocol used for encrypted DMs and token transfers in Sphere.
- **NIP-29**: A Nostr protocol extension for relay-based group chat.
- **dApp**: A decentralized application that can connect to your Sphere wallet.
