export interface TriviaQuestion extends QuestionSource {
    id: string;
}

// Source questions without IDs (IDs are assigned automatically)
interface QuestionSource {
    category: string;
    question: string;
    correctAnswer: string;
    incorrectAnswers: string[];
}

export const categories = ['Basics & Vision', 'Under the Hood', 'Security & Privacy',
    'Using Unicity', 'Building & Ecosystem', 'Science'];

const questionData: QuestionSource[] = [
    // --- CATEGORY 1: BASICS & VISION ---
    {
        category: 'Basics & Vision',
        question: 'What is the primary "real-world" analogy used to describe how Unicity assets function?',
        correctAnswer: 'Physical Cash',
        incorrectAnswers: ['A bank account', 'A credit card', 'A shared spreadsheet']
    },
    {
        category: 'Basics & Vision',
        question: 'Unlike traditional blockchains that share a global ledger, where do assets live in Unicity?',
        correctAnswer: 'Off-chain in Web2 environments',
        incorrectAnswers: ['On a centralized server', 'Inside the miners\' hardware', 'On the Ethereum mainnet']
    },
    {
        category: 'Basics & Vision',
        question: 'What is the "Hair on fire" problem Unicity aims to solve?',
        correctAnswer: 'Financial access friction in emerging markets',
        incorrectAnswers: ['Slow video rendering speeds', 'High electricity costs of AI', 'The lack of VR content']
    },
    {
        category: 'Basics & Vision',
        question: 'What makes Unicity assets "self-authenticating"?',
        correctAnswer: 'They can be validated by the recipient without external trust',
        incorrectAnswers: ['They use biometric scanning', 'They are validated by aggregators on every level', 'They are printed on paper']
    },
    {
        category: 'Basics & Vision',
        question: 'Which constraint does Unicity remove to achieve unlimited throughput?',
        correctAnswer: 'The need for global ordering of all transactions',
        incorrectAnswers: ['The need for electricity', 'The need for internet connectivity', 'The need for user passwords']
    },
    {
        category: 'Basics & Vision',
        question: 'In the Unicity model, what is the blockchain primarily used for?',
        correctAnswer: 'Preventing double-spending (Uniqueness Proofs)',
        incorrectAnswers: ['Storing all user data', 'Executing every smart contract', 'Running the user interface']
    },
    {
        category: 'Basics & Vision',
        question: 'How does Unicity view the famous "Blockchain Trilemma"?',
        correctAnswer: 'It solves it by moving execution off-chain',
        incorrectAnswers: ['It accepts it as an unavoidable law', 'It sidesteps it with Zero-Knowledge proofs', 'It solves it using bigger blocks']
    },
    {
        category: 'Basics & Vision',
        question: 'Which user group is Unicity specifically targeting to unlock a massive Total Addressable Market (TAM)?',
        correctAnswer: 'Users in emerging markets',
        incorrectAnswers: ['Wall Street bankers', 'Silicon Valley developers', 'Crypto whales and experienced investors']
    },
    {
        category: 'Basics & Vision',
        question: 'What is the ultimate friction Unicity aims to remove for the end-user?',
        correctAnswer: 'The need to know they are using blockchain at all',
        incorrectAnswers: ['The need to pay taxes', 'The need to have a smartphone', 'The need to download apps']
    },
    {
        category: 'Basics & Vision',
        question: 'How does Unicity define "ownership" of a token?',
        correctAnswer: 'Control of the private key or predicate condition',
        incorrectAnswers: ['Possession of a receipt', 'Having a verified email', 'Using DNS records to prove key ownership']
    },

    // --- CATEGORY 2: UNDER THE HOOD ---
    {
        category: 'Under the Hood',
        question: 'What are the three hierarchical layers of the Unicity system?',
        correctAnswer: 'Consensus, Aggregation, and Execution',
        incorrectAnswers: ['Network, Transport, and Application', 'Layer 1, Layer 2, and Layer 3', 'Client, Server, and Database']
    },
    {
        category: 'Under the Hood',
        question: 'What consensus mechanism does the Unicity Consensus Layer use?',
        correctAnswer: 'Proof of Work with RandomX',
        incorrectAnswers: ['Proof of Elapsed Time', 'Proof of History', 'Delegated Proof of Stake with ECDSA signatures']
    },
    {
        category: 'Under the Hood',
        question: 'What is the specific role of the "Uniqueness Prover"?',
        correctAnswer: 'A Merkle tree that registers state transitions',
        incorrectAnswers: ['A robot that checks IDs', 'A specialized high-performance mining rig', 'A governance voting system']
    },
    {
        category: 'Under the Hood',
        question: 'Why does Unicity use RandomX for its Proof of Work?',
        correctAnswer: 'To prevent mining centralization (ASIC resistance)',
        incorrectAnswers: ['Because it is the faster than the industry standard of SHA-256', 'Because it uses less energy', 'Because it was created by AI']
    },
    {
        category: 'Under the Hood',
        question: 'What is stored in the Aggregation Layer?',
        correctAnswer: 'A distributed append-only dictionary of spent states',
        incorrectAnswers: ['The full history of all transactions', 'User passwords and emails', 'Smart contract code']
    },
    {
        category: 'Under the Hood',
        question: 'What does the Consensus Layer validate?',
        correctAnswer: 'The state transitions of the Aggregation Layer',
        incorrectAnswers: ['Every single user payment', 'The validity of smart contracts', 'The user\'s identity']
    },
    {
        category: 'Under the Hood',
        question: 'Technically, every recipient of a Unicity transaction acts as a:',
        correctAnswer: 'Client validator',
        incorrectAnswers: ['Centralized server', 'Passive observer', 'Data miner']
    },
    {
        category: 'Under the Hood',
        question: 'What allows Unicity to scale linearly with the number of participants?',
        correctAnswer: 'Parallel, off-chain execution',
        incorrectAnswers: ['Larger block sizes', 'Faster internet speeds', 'More centralized servers']
    },
    {
        category: 'Under the Hood',
        question: 'What is the "genesis record" in a Unicity token?',
        correctAnswer: 'The initial definition of token parameters (supply, metadata)',
        incorrectAnswers: ['The first transaction ever made', 'The founder\'s signature', 'A link to the whitepaper']
    },
    {
        category: 'Under the Hood',
        question: 'What data structure is used to ensure the Aggregation Layer cannot "forget" spent states?',
        correctAnswer: 'Sparse Merkle Tree (SMT)',
        incorrectAnswers: ['Linked List', 'SQL Table', 'Binary Heap']
    },

    // --- CATEGORY 3: SECURITY & PRIVACY ---
    {
        category: 'Security & Privacy',
        question: 'What are the three core security properties proved in the Unicity whitepaper?',
        correctAnswer: 'No double-spending, no blocking, and service-side privacy',
        incorrectAnswers: ['Speed, cost, and fun', 'KYC, AML, and CFT', 'Storage, compute, and networking']
    },
    {
        category: 'Security & Privacy',
        question: 'How does Unicity ensure privacy from the service itself?',
        correctAnswer: 'Transactions are committed using perfectly hiding commitments',
        incorrectAnswers: ['By trusting the operators', 'By using a VPN', 'By deleting data daily']
    },
    {
        category: 'Security & Privacy',
        question: 'What does "MPK" stand for in the context of Unicity\'s privacy?',
        correctAnswer: 'Multi-Public-Key (One secret, multiple unlinkable public keys)',
        incorrectAnswers: ['Massive Public Key', 'Multi-Party Knowledge', 'Mining Power Kilowatt']
    },
    {
        category: 'Security & Privacy',
        question: 'What prevents a malicious actor from "blocking" a token (preventing it from being spent)?',
        correctAnswer: 'Only the legitimate owner can generate the spending signature',
        incorrectAnswers: ['A centralized whitelist', 'An algorithm designed to detect non-authentic signatures', 'A governance DAO']
    },
    {
        category: 'Security & Privacy',
        question: 'If you lose the device where your Unicity tokens are stored, what happens?',
        correctAnswer: 'They are lost, unless you have a backup (Self-Custody)',
        incorrectAnswers: ['Unicity can reset them', 'The bank refunds you', 'You can call support to restore them']
    },
    {
        category: 'Security & Privacy',
        question: 'How does Unicity achieve "Transaction Identity Unlinkability"?',
        correctAnswer: 'Through symmetric blinding masks and ephemeral keys',
        incorrectAnswers: ['By mixing coins in a pool', 'By making all transactions public', 'By using a centralized privacy service']
    },
    {
        category: 'Security & Privacy',
        question: 'What is the trust model of Unicity compared to Bitcoin?',
        correctAnswer: 'It replicates the "Trust No One" model',
        incorrectAnswers: ['It requires trusting a CEO', 'It is a federated model', 'It is weaker than Bitcoin']
    },
    {
        category: 'Security & Privacy',
        question: 'Why doesn\'t Unicity need a "trusted setup" for its cryptography?',
        correctAnswer: 'It relies on standard cryptographic assumptions (like DL/DDH)',
        incorrectAnswers: ['It actually does need one', 'It uses proprietary math', 'It relies on hardware security only']
    },
    {
        category: 'Security & Privacy',
        question: 'What protects the system from mining centralization?',
        correctAnswer: 'The RandomX algorithm',
        incorrectAnswers: ['Low hardware costs', 'Government regulation', 'A closed miner list']
    },
    {
        category: 'Security & Privacy',
        question: 'What happens if the Aggregation Layer tries to fork?',
        correctAnswer: 'The user/SDK can detect it via consistency proofs',
        incorrectAnswers: ['The Aggregation Layer generates an automatic fault proof', 'It is impossible to fork', 'The users lose all funds']
    },

    // --- CATEGORY 4: USING UNICITY ---
    {
        category: 'Using Unicity',
        question: 'Can you use Unicity without an internet connection?',
        correctAnswer: 'Yes, via Offline Transactions',
        incorrectAnswers: ['No, internet is required', 'Only for viewing balances', 'Only on Sundays']
    },
    {
        category: 'Using Unicity',
        question: 'What is the estimated cost of a Unicity transaction?',
        correctAnswer: 'Less than $0.00000001',
        incorrectAnswers: ['$1.00', '$0.05', '$0']
    },
    {
        category: 'Using Unicity',
        question: 'How are "Offline Transactions" eventually settled?',
        correctAnswer: 'They are posted online when connectivity is restored',
        incorrectAnswers: ['They are never posted', 'They settle via SMS', 'They require a physical visit to a bank']
    },
    {
        category: 'Using Unicity',
        question: 'What is a "Nametag" in Unicity?',
        correctAnswer: 'An addressable, self-authenticated data structure for identity',
        incorrectAnswers: ['A physical sticker', 'A marketing banner', 'A tracking cookie']
    },
    {
        category: 'Using Unicity',
        question: 'What mechanism allows Unicity to bridge assets from Ethereum?',
        correctAnswer: 'Lock-mint / Burn-release model',
        incorrectAnswers: ['Copy-paste model', 'Screenshot model', 'Trusted custodian model']
    },
    {
        category: 'Using Unicity',
        question: 'Do you need a "Wallet Address" to receive a Unicity token?',
        correctAnswer: 'No, tokens can be transferred via email or other channels, pending additional security assumptions',
        incorrectAnswers: ['Yes, always', 'Yes, and it must be KYC\'d', 'Yes, and it costs more']
    },
    {
        category: 'Using Unicity',
        question: 'What allows developers to build on Unicity without learning Solidity?',
        correctAnswer: 'The State Transition SDK and Agents',
        incorrectAnswers: ['They must learn Solidity', 'A magic wand', 'There are no developer tools']
    },
    {
        category: 'Using Unicity',
        question: 'In the "Carpatree" case study, what growth was achieved using Unicity?',
        correctAnswer: '21.6% growth in returning customers',
        incorrectAnswers: ['Zero growth', 'The app crashed', '50% user loss']
    },
    {
        category: 'Using Unicity',
        question: 'How does Unicity handle transaction fees for developers?',
        correctAnswer: 'Likely a subscription model based on bands',
        incorrectAnswers: ['High gas fees per user', 'A percentage of all profits', 'It is strictly pay-per-click']
    },

    // --- CATEGORY 5: BUILDING & ECOSYSTEM ---
    {
        category: 'Science',
        question: 'What does Unicity use instead of traditional smart contracts?',
        correctAnswer: 'Agents',
        incorrectAnswers: ['Static Scripts', 'Centralized Databases', 'Manual Forms']
    },
    {
        category: 'Science',
        question: 'What is a "Predicate" in Unicity?',
        correctAnswer: 'A programmable condition (function) that defines ownership rules',
        incorrectAnswers: ['A type of database', 'A grammatical term', 'A hardware component']
    },
    {
        category: 'Building & Ecosystem',
        question: 'In the "Quake" gaming example, where does the game logic run?',
        correctAnswer: 'Off-chain inside local agents, synchronized P2P',
        incorrectAnswers: ['On the Ethereum mainnet', 'On a central Blizzard server', 'On the miner\'s GPU']
    },
    {
        category: 'Building & Ecosystem',
        question: 'What is a "CLOB Agent"?',
        correctAnswer: 'A Central Limit Order Book running off-chain',
        incorrectAnswers: ['A clumsy robot', 'A cleaning service', 'A type of shoe']
    },
    {
        category: 'Building & Ecosystem',
        question: 'How do "Atomic Swaps" work in Unicity?',
        correctAnswer: 'Via escrow predicates implementing a 2-phase commit',
        incorrectAnswers: ['By trusting a middleman', 'By sending emails', 'By guessing']
    },
    {
        category: 'Building & Ecosystem',
        question: 'What enables Unicity to run AI Agents efficiently?',
        correctAnswer: 'Untethered tokens and off-chain execution',
        incorrectAnswers: ['It uses a specialized AI coin', 'It restricts AI usage', 'It has a slow block time']
    },
    {
        category: 'Building & Ecosystem',
        question: 'What does the Unicity State Transition SDK allow developers to do?',
        correctAnswer: 'Mint and transfer tokens using standard Web2 code',
        incorrectAnswers: ['Mine Bitcoin', 'Hack the Pentagon', 'Build hardware wallets']
    },
    {
        category: 'Building & Ecosystem',
        question: 'Can Unicity support a decentralized exchange (DEX)?',
        correctAnswer: 'Yes, via agents executing AMM logic with verifiable certificates',
        incorrectAnswers: ['No, DeFi is impossible', 'Only centralized exchanges', 'Only if it copies Uniswap exactly']
    },
    {
        category: 'Building & Ecosystem',
        question: 'What is "Single Asset Programmability"?',
        correctAnswer: 'Using predicates to customize rules for a specific token',
        incorrectAnswers: ['Programming only one token ever', 'A restrictive license', 'A simplistic wallet']
    },

    // --- CATEGORY: BASICS & VISION ---
    {
        category: 'Basics & Vision',
        question: 'In the Unicity "cash analogy", how does the role of the recipient differ from a standard bank transfer?',
        correctAnswer: 'The recipient is solely responsible for verifying the authenticity of the asset',
        incorrectAnswers: ['The recipient must pay a deposit fee to the central bank', 'The recipient waits for a global consensus vote', 'The recipient delegates trust to a centralized sequencer']
    },
    {
        category: 'Basics & Vision',
        question: 'Unicity argues that increasing the shared state space of a blockchain inevitably leads to what negative outcome?',
        correctAnswer: 'Competition for resources (memory/compute) and gas fees',
        incorrectAnswers: ['A decrease in network security', 'An increase in government censorship', 'A surplus of unused block space']
    },
    {
        category: 'Basics & Vision',
        question: 'Why does Unicity consider the concept of "going on-chain" to be a source of friction?',
        correctAnswer: 'Because assets should be interoperable across Web2 and Web3 without constant global synchronization',
        incorrectAnswers: ['Because on-chain transactions are illegal in emerging markets', 'Because block explorers are relatively difficult to use', 'Because the faster chains require specialized hardware to access']
    },
    {
        category: 'Basics & Vision',
        question: 'What is the "end state" goal for Unicity regarding its centralized components like the Proof Aggregation Layer?',
        correctAnswer: 'To become a fully decentralized, censorship-resistant system similar to Bitcoin',
        incorrectAnswers: ['To be acquired by a major Web2 tech giant', 'To remain a permissioned enterprise ledger', 'To become a fully decentralized, censorship-resistant network and transition to Proof of Stake']
    },
    {
        category: 'Basics & Vision',
        question: 'How does Unicity define "Local Execution"?',
        correctAnswer: 'Processing assets off-chain with unconstrained throughput and privacy',
        incorrectAnswers: ['Running a full node in a cloud provided by a local business, ensuring fast access', 'Executing trades only within a specific city', 'Restricting smart contracts to a single language']
    },
    {
        category: 'Basics & Vision',
        question: 'Unicity compares its architecture to RGB protocol on Bitcoin, but notes RGB still suffers from what limitation?',
        correctAnswer: 'Complex transactions require a transaction on the main Bitcoin blockchain',
        incorrectAnswers: ['RGB uses an outdated version of Solidity', 'RGB is not open source', 'RGB requires a trusted federation']
    },
    {
        category: 'Basics & Vision',
        question: 'What is the core philosophy regarding "Global Ordering" in Unicity?',
        correctAnswer: 'Global ordering is unnecessary; only double-spending prevention requires coordination',
        incorrectAnswers: ['Global ordering must be maintained by a single sequencer', 'Global ordering is built by each verifier node locally', 'Global ordering should be handled by AI agents']
    },

    // --- CATEGORY: UNDER THE HOOD ---
    {
        category: 'Under the Hood',
        question: 'Technically, the Proof Aggregation Layer is oblivious to transaction validation. What is its only job?',
        correctAnswer: 'Not to forget spent user token states (hashes)',
        incorrectAnswers: ['To verify the KYC status of the sender', 'To execute the logic inside the smart contract', 'To validate the transactions to check for bugs']
    },
    {
        category: 'Under the Hood',
        question: 'What specific mechanism ensures the Aggregation Layer has not modified or removed commitments?',
        correctAnswer: 'Recursive consistency proofs verified by the Consensus Layer',
        incorrectAnswers: ['A committee of 21 elected validators', 'A slashing mechanism for bad behavior', 'Random audits by third-party firms']
    },
    {
        category: 'Under the Hood',
        question: 'When a user acts as a "maximalist" validator in Unicity, what must they download?',
        correctAnswer: 'The Unicity PoW headers to verify the system from the genesis block',
        incorrectAnswers: ['The entire history of all user transactions', 'A copy of the Ethereum state trie', 'The source code of the miner software']
    },
    {
        category: 'Under the Hood',
        question: 'How does Unicity handle Data Availability (DA) compared to "modular" blockchains?',
        correctAnswer: 'It is the token owner\'s responsibility to not lose their asset data',
        incorrectAnswers: ['Data is stored on IPFS automatically', 'A specialized DA layer like Celestia is mandatory', 'Miners store all data for 90 days']
    },
    {
        category: 'Under the Hood',
        question: 'What happens to the state of the Proof Aggregation Layer before switching to the next cumulative state?',
        correctAnswer: 'A delta-proof of non-deletion is produced',
        incorrectAnswers: ['The state is wiped and reset', 'A snapshot is sent to Ethereum', 'The gas fees are redistributed']
    },
    {
        category: 'Under the Hood',
        question: 'Why is the root of trust in Unicity considered "compact"?',
        correctAnswer: 'The PoW chain contains no user transactions, only headers and minimal data',
        incorrectAnswers: ['It fits on a floppy disk', 'It relies on a small group of trusted nodes', 'It uses aggressive ZK-Snark compression for everything']
    },
    {
        category: 'Under the Hood',
        question: 'In the Unicity block explorer, what would you predominately see?',
        correctAnswer: 'PoW headers and coinbase transactions, but no user activity',
        incorrectAnswers: ['A live feed of global token transfers', 'Smart contract deployments', 'JPEG metadata']
    },
    {
        category: 'Under the Hood',
        question: 'What is the "Uniqueness Prover" technically structured as?',
        correctAnswer: 'A Merkle tree that adds a leaf for every off-chain transaction',
        incorrectAnswers: ['A linear linked list', 'A relational SQL database', 'A Directed Acyclic Graph (DAG)']
    },

    // --- CATEGORY: SECURITY & PRIVACY ---
    {
        category: 'Security & Privacy',
        question: 'In the Unicity security model, what is the definition of "No Blocking"?',
        correctAnswer: 'Only the legitimate owner (who can solve the predicate) can spend or block the token',
        incorrectAnswers: ['The network can never be paused', 'Miners cannot censor transactions based on fees', 'Users cannot block each other on the UI']
    },
    {
        category: 'Security & Privacy',
        question: 'How does Unicity ensure "Service-Side Privacy"?',
        correctAnswer: 'The infrastructure sees only hashes and commitments, linking nothing to the user',
        incorrectAnswers: ['By using a Tor browser built into the wallet', 'By legally requiring the service to ignore data', 'By rotating IP addresses every transaction']
    },
    {
        category: 'Security & Privacy',
        question: 'What is "Forward Privacy" in the context of Unicity\'s MPK scheme?',
        correctAnswer: 'If a transaction key is leaked, past keys and the persistent identity remain secure',
        incorrectAnswers: ['Future transactions are automatically visible', 'The ability to send messages to the future', 'The sender knows the recipient\'s balance']
    },
    {
        category: 'Security & Privacy',
        question: 'What cryptographic primitive protects the transaction data D from being seen by the Unicity Service?',
        correctAnswer: 'A perfectly hiding commitment scheme',
        incorrectAnswers: ['Rot13 encryption', 'A simple MD5 hash', 'A trusted hardware enclave']
    },
    {
        category: 'Security & Privacy',
        question: 'Why does Unicity prefer "transaction specific blinding masks" over heavy ZK-proofs for privacy?',
        correctAnswer: 'They are far easier to compute while still hiding sensitive details',
        incorrectAnswers: ['ZK-proofs are mathematically impossible', 'Blinding masks allow the government to see data', 'ZK-proofs take too much storage space']
    },
    {
        category: 'Security & Privacy',
        question: 'What happens if a malicious actor tries to double-spend a coin by sending two requests?',
        correctAnswer: 'The second request will fail to get a valid inclusion proof',
        incorrectAnswers: ['The actor is automatically fined', 'The actor\'s wallet is deleted', 'Both transactions are accepted but flagged']
    },
    {
        category: 'Security & Privacy',
        question: 'What is the role of the "Exclusion Proof" in High Frequency Trading?',
        correctAnswer: 'It confirms a state transition has NOT been registered yet, allowing optimistic execution',
        incorrectAnswers: ['It bans a user from the network', 'It proves a token does not exist', 'It removes bad actors from the consensus set']
    },
    {
        category: 'Security & Privacy',
        question: 'How does Unicity mitigate the risk of "fake weapons" in a decentralized game like Quake?',
        correctAnswer: 'Agents synchronize verifiable game state tokens to prevent cheating',
        incorrectAnswers: ['By running the game on a central server', 'By banning players whose movement patterns match the custom Unicity AI detectors', 'By requiring manual review of every match']
    },

    // --- CATEGORY: SCIENCE ---
    {
        category: 'Science',
        question: 'What implies that a commitment scheme is "perfectly hiding"?',
        correctAnswer: 'The commitment reveals absolutely no information about the message, regardless of computational power',
        incorrectAnswers: ['It is encrypted with a 256-bit key', 'It uses a quantum computer', 'It uses steganography to hide "in plain sight"']
    },
    {
        category: 'Science',
        question: 'What standard cryptographic assumption is the privacy of the MPK (Multi-Public-Key) scheme based on?',
        correctAnswer: 'Decisional Diffie-Hellman (DDH) assumption',
        incorrectAnswers: ['The Traveling Salesman Problem', 'The Integer Factorization assumption (RSA)', 'The Proof of Work difficulty adjustment']
    },
    {
        category: 'Science',
        question: 'In the Execution Layer Whitepaper, how is a "Predicate" formally defined?',
        correctAnswer: 'A logical condition v(time, message, signature) that evaluates to TRUE or FALSE',
        incorrectAnswers: ['A variable that stores the token price', 'A smart contract written in Rust', 'It is defined as a digital signature scheme with formal security proofs']
    },
    {
        category: 'Science',
        question: 'What is the "Binding" property of a commitment scheme?',
        correctAnswer: 'It is impossible to open the commitment to two different values',
        incorrectAnswers: ['It binds the user to the specific public key for a given token', 'It connects two blocks together', 'It encrypts the data with a fixed key']
    },
    {
        category: 'Science',
        question: 'In the MPK scheme, how does a user generate multiple public keys from one secret?',
        correctAnswer: 'By using a Pseudo-Random Function (PRF) keyed with their secret',
        incorrectAnswers: ['By creating a new wallet for every transaction', 'By asking the Unicity Service for keys', 'By mining them with a CPU']
    },
    {
        category: 'Science',
        question: 'What does the variable "tau" (τ) represent in the formal predicate definition?',
        correctAnswer: 'System time (defined by the Unicity Service)',
        incorrectAnswers: ['The transaction fee', 'The user\'s reputation score', 'The token amount']
    },

    // --- CATEGORY: USING UNICITY ---
    {
        category: 'Using Unicity',
        question: 'In the "Offline Protocol 1", what specific requirement is placed on the payer?',
        correctAnswer: 'They must possess trusted/certified hardware',
        incorrectAnswers: ['They must have a satellite phone', 'They must be certified by the appropriate body', 'They must pre-pay a sufficiently large deposit']
    },
    {
        category: 'Using Unicity',
        question: 'In "Offline Protocol 2" (without special hardware), what must the payer do while still online?',
        correctAnswer: 'Lock sufficient tokens for specific recipients with a deadline',
        incorrectAnswers: ['Download the entire blockchain', 'Send their private key to the recipient', 'Pre-mine the tokens']
    },
    {
        category: 'Using Unicity',
        question: 'How do "Nametags" in Unicity differ from a standard DNS service?',
        correctAnswer: 'They are self-authenticated data structures encoded within the token itself',
        incorrectAnswers: ['They are rented from a central authority', 'They can be revoked by the government', 'They are only visible to the owner']
    },
    {
        category: 'Using Unicity',
        question: 'How does bridging from an EVM chain (like Ethereum) to Unicity generally work?',
        correctAnswer: 'Tokens are locked in a contract, generating an event that proofs the genesis of the Unicity token',
        incorrectAnswers: ['Tokens are destroyed and re-minted by a central organisation', 'Tokens are swapped on Uniswap', 'Tokens are sent to a multi-sig wallet']
    },
    {
        category: 'Using Unicity',
        question: 'When bridging back to a source chain, what is the role of the "Prover Network"?',
        correctAnswer: 'To execute the resource-intensive ZK proof generation for the batch',
        incorrectAnswers: ['To manually approve withdrawals', 'To pay the gas fees for the user', 'To hold the keys to the vault']
    },
    {
        category: 'Using Unicity',
        question: 'Why doesn\'t a user need a "Wallet Address" to receive tokens?',
        correctAnswer: 'Tokens can be "Digital Bearer Instruments" sent via any communication channel',
        incorrectAnswers: ['Because the system uses facial recognition', 'Because the tokens are sent to their GPS location', 'Because the tokens are physically mailed']
    },
    {
        category: 'Using Unicity',
        question: 'What happens if an Offline Protocol 2 (without secure hardwre) payment deadline passes without the transaction being broadcast?',
        correctAnswer: 'Control of the token reverts back to the original payer',
        incorrectAnswers: ['The tokens are burned', 'The tokens are sent to community account', 'The recipient claims them automatically']
    },

    // --- CATEGORY: BUILDING & ECOSYSTEM ---
    {
        category: 'Building & Ecosystem',
        question: 'How does Unicity define "Single Asset Programmability"?',
        correctAnswer: 'Using predicates (functions) to define rules for a specific token',
        incorrectAnswers: ['Writing a smart contract that controls all tokens', 'Creating a token that can only be used once', 'A token that represents one share of stock']
    },
    {
        category: 'Building & Ecosystem',
        question: 'What is an "Oracle" in the Unicity ecosystem?',
        correctAnswer: 'A network of agents certifying real-world data commits',
        incorrectAnswers: ['A centralized API feed', 'A smart contract on Ethereum', 'A simulated crystal ball']
    },
    {
        category: 'Building & Ecosystem',
        question: 'How are Yield Farming and Staking implemented in Unicity?',
        correctAnswer: 'By locking tokens in an escrow predicate with specific release conditions',
        incorrectAnswers: ['They are not possible', 'By sending tokens to a centralized staking pool', 'By running a validator node']
    },
    {
        category: 'Building & Ecosystem',
        question: 'What allows Unicity Agents to be "Turing Complete"?',
        correctAnswer: 'They can run any deterministic or non-deterministic code (like Python/C++) off-chain',
        incorrectAnswers: ['They use a special version of Solidity', 'They are run by supercomputers', 'They are connected to ChatGPT']
    },
    {
        category: 'Building & Ecosystem',
        question: 'What distinguishes a Unicity "DAO" from a traditional one?',
        correctAnswer: 'Logic runs on user agents (client-side) rather than a central chain',
        incorrectAnswers: ['Voting mechanisms must use Proof of Work as an anti-sybil measure', 'The DAOs\' legal representatives are registered in the Delaware, US', 'It requires a Discord server']
    },
    {
        category: 'Building & Ecosystem',
        question: 'What predicate function would you use to implement a "Multi-sig" wallet?',
        correctAnswer: 'A predicate requiring signatures from Public Key A AND Public Key B',
        incorrectAnswers: ['A time-lock predicate', 'A hashing predicate', 'A smart contract predicate on Ethereum']
    },
    {
        category: 'Building & Ecosystem',
        question: 'Why can Unicity be considered "Chain-Agnostic"?',
        correctAnswer: 'Tokens can require proofs from any chain (Unicity, Ethereum, Solana) or trusted hardware',
        incorrectAnswers: ['It has no chain of its own', 'It ignores all other blockchains', 'It only works with Bitcoin']
    },

    // Harder questions
    {
        category: 'Science',
        question: 'Traditional blockchains suffer from quadratic complexity growth. How does Unicity achieve linear scalability?',
        correctAnswer: 'By checking only double-spending on-chain',
        incorrectAnswers: [
            'By increasing the block size limit',
            'By using sharding on the Execution Layer',
            'By requiring all validators to re-execute transactions'
        ]
    },
    {
        category: 'Science',
        question: 'The Unicity framework is composed of three hierarchical layers. Which layer is responsible for maintaining the "root of trust"?',
        correctAnswer: 'The Consensus Layer',
        incorrectAnswers: [
            'The Aggregation Layer',
            'The Execution Layer',
            'The Application Layer'
        ]
    },
    {
        category: 'Science',
        question: 'Unicity formally proves three fundamental security properties. Besides "No Double-Spending" and "Service-side Privacy," what is the third property?',
        correctAnswer: 'No Blocking',
        incorrectAnswers: [
            'No Latency',
            'No Fees',
            'No Forks'
        ]
    },
    {
        category: 'Science',
        question: 'Unlike traditional blockchains where validators execute logic, who is responsible for transaction execution and business logic in Unicity?',
        correctAnswer: 'The relying parties (Recipients)',
        incorrectAnswers: [
            'The Miners',
            'The Consensus Layer validators',
            'The Aggregation Layer nodes'
        ]
    },
    {
        category: 'Science',
        question: 'Unicity allows for "Predicates" to generalize ownership. What functionality do Predicates enable off-chain?',
        correctAnswer: 'Smart contract-like programmable conditions',
        incorrectAnswers: [
            'Mining new blocks',
            'Generating inflation rewards',
            'Broadcasting data to the entire network'
        ]
    },
    {
        category: 'Science',
        question: 'To eliminate key management overhead while maintaining privacy, what signature scheme does Unicity introduce?',
        correctAnswer: 'Multi-Public-Key (MPK) signatures',
        incorrectAnswers: [
            'Single-Use-Only keys',
            'Static RSA keypairs',
            'Shared custodial keys'
        ]
    },
    {
        category: 'Science',
        question: 'The Aggregation Layer maintains a specific type of data structure to track spent token states. What is it?',
        correctAnswer: 'A distributed append-only dictionary',
        incorrectAnswers: [
            'A mutable SQL database',
            'A cyclic graph of all transactions',
            'A temporary cache memory'
        ]
    },
    {
        category: 'Science',
        question: 'How does the Unicity Service prove to a user that a transaction has been successfully registered and the state is spent?',
        correctAnswer: 'By returning an Inclusion Proof',
        incorrectAnswers: [
            'By sending a signed email confirmation',
            'By updating a public block explorer',
            'By returning the private key'
        ]
    },
    {
        category: 'Science',
        question: 'In the Unicity security model, what ensures that the "next state" of a token cannot be predicted or linked by the Service?',
        correctAnswer: 'A random nonce committed with the transaction',
        incorrectAnswers: [
            'An encryption sandbox ran by aggregators',
            'A user\'s IP address',
            'A public key of the sender'
        ]
    },
    {
        category: 'Science',
        question: 'What specific data does the Unicity Service store to prevent double-spending?',
        correctAnswer: 'The cryptographic commitment to spent asset states',
        incorrectAnswers: [
            'The full history of every transaction',
            'The smart contract source code',
            'The identities of all token holders'
        ]
    },
    {
        category: 'Smart Contracts',
        question: 'If a user creates a "Predicate" (smart contract) that is mathematically impossible to solve, what happens?',
        correctAnswer: 'The token state becomes blocked by the user\'s own design',
        incorrectAnswers: [
            'The Aggregators fork the blockchain',
            'The Consensus Layer rejects the block',
            'The token is automatically returned to the mint'
        ]
    },
    {
        category: 'Science',
        question: 'What is the "Core Bottleneck" of traditional blockchains that Unicity explicitly removes?',
        correctAnswer: 'Every validator processing every transaction',
        incorrectAnswers: [
            'The cost of electricity for mining',
            'The size of the hard drives used',
            'The speed of light in fiber optic cables'
        ]
    },
    {
        category: 'Science',
        question: 'How does Unicity achieve "Forward Privacy" regarding transaction keys?',
        correctAnswer: 'Compromising a transaction key does not reveal the persistent private key',
        incorrectAnswers: [
            'By deleting old transactions every 24 hours',
            'By using a centralized mixer',
            'By requiring KYC for all wallets'
        ]
    },
    {
        category: 'Science',
        question: 'Unicity minimizes on-chain operations to make tokens "self-authenticating." What does this allow the system to do?',
        correctAnswer: 'Scale linearly with the number of participants',
        incorrectAnswers: [
            'Scale exponentially with electricity usage',
            'Stop producing blocks when idle',
            'Skip signature validation for speed'
        ]
    },
    {
        category: 'Science',
        question: 'The Unicity paper proves that all security properties are preserved under reduction to what mathematical concept?',
        correctAnswer: 'Predicate family unforgeability',
        incorrectAnswers: [
            'Proof of Stake voting weight',
            'The random oracle model',
            'The total number of nodes'
        ]
    },
    {
        category: 'Science',
        question: 'The "Mint Transaction" is unique because it is the only transaction that:',
        correctAnswer: 'Assigns a unique Token Identifier',
        incorrectAnswers: [
            'Does not require a signature',
            'Is visible to the public',
            'Uses identity cryptography'
        ]
    },
    {
        category: 'Science',
        question: 'What is the specific role of the "Aggregation Layer" regarding the "Execution Layer"?',
        correctAnswer: 'It allows the Execution Layer to avoid the risk of double-spending',
        incorrectAnswers: [
            'It executes the smart contract code',
            'It stores the user\'s Unicity IDs',
            'It manages the peer-to-peer connection'
        ]
    },
    {
        category: 'Science',
        question: 'Which property ensures that an adversary observing multiple transactions cannot determine they belong to the same recipient?',
        correctAnswer: 'Recipient Unlinkability',
        incorrectAnswers: [
            'Network Transparency',
            'Double-Blind Routing',
            'Static Address Verification'
        ]
    },

    // The hardest questions
    {
        category: 'Science',
        question: 'Unicity uses the "Iverson symbol" in its formal probability definitions. What does the notation [w ∈ A] evaluate to?',
        correctAnswer: '1 if w is in A, and 0 otherwise',
        incorrectAnswers: [
            'The probability of w occurring in A',
            'The set of all w inside A',
            'Undefined if A is empty'
        ]
     },
    {
        category: 'Science',
        question: 'In the Exact Security Model used by Unicity, what does the security profile S_f(ε) represent?',
        correctAnswer: 'A lower bound on the running time of an adversary with success ε',
        incorrectAnswers: [
            'The maximum probability of a collision',
            'An upper bound on the running time of an adversary with success ε',
            'The upper bound of computational overhead'
        ]
    },
    {
        category: 'Science',
        question: 'Theorem 5.1 states that Unicity is secure against blocking if the hash function is collision-resistant and the signature scheme possesses which specific property?',
        correctAnswer: 'Existential unforgeability under chosen message attacks',
        incorrectAnswers: [
            'Perfect Secrecy',
            'Selective Unforgeability',
            'Quantum Resistance'
        ]
    },
    {
        category: 'Science',
        question: 'The security profile against association, S_assoc(ε), is calculated by subtracting which costs from the general security profile S(ε)?',
        correctAnswer: 'Sampling time, hashing time, and commitment computation time',
        incorrectAnswers: [
            'Hashing time and commitment computation time',
            'Hashing time, commitment computation time and consensus computation time',
            'Consensus round time and block propagation time'
        ]
    },
    {
        category: 'Science',
        question: 'In the non-interactive MPK protocol for ECDSA, how is the blinding factor "s" calculated to prevent a malicious sender from compromising unlinkability?',
        correctAnswer: 'H(r·P || R || tx_prev)',
        incorrectAnswers: [
            'H(r·G || P)',
            'r · H(P || R)',
            'H(d || tx_next)'
        ]
    },
    {
        category: 'Science',
        question: 'The "Forward Privacy" property ensures that if a transaction-specific private key is leaked, the persistent key remains safe. This relies on the hardness of which problem?',
        correctAnswer: 'The Discrete Logarithm (DL) problem',
        incorrectAnswers: [
            'The Knapsack problem',
            'The Integer Factorization problem',
            'The Traveling Salesman problem'
        ]
    },
    {
        category: 'Science',
        question: 'When utilizing generalized Predicates, Unicity redefines the "No Blocking" condition. Who is the ONLY entity capable of blocking a token state under this definition?',
        correctAnswer: 'Only those who can solve the predicate ν',
        incorrectAnswers: [
            'Only the Unicity Service validators',
            'Only the original minter of the token',
            'Only the Consensus Layer leaders'
        ]
    },
    {
        category: 'Science',
        question: 'In the formal proof for Double-Spending security, the adversary is shown to succeed only if they find a hash collision or...',
        correctAnswer: 'Open a commitment in two different ways',
        incorrectAnswers: [
            'Forge a valid signature without the private key',
            'Predict the random nonce x',
            'Invert the one-way hash function'
        ]
    },
    {
        category: 'Science',
        question: 'In the Unicity security proofs, the hash function H_1 used in ECDSA protocols is modeled as what specific cryptographic object?',
        correctAnswer: 'A Random Oracle',
        incorrectAnswers: [
            'A Standard PRF',
            'A Collision-Free Permutation',
            'A Trapdoor Function'
        ]
    },
    {
        category: 'Science',
        question: 'For elliptic curves where the group order q is much less than 2^512, how does Unicity construct the PRF F_k(ι) using HMAC?',
        correctAnswer: 'Int(HMAC_sha512(k; ι)) mod q',
        incorrectAnswers: [
            'HMAC_sha256(k; ι) mod q',
            'Int(HMAC_sha512(ι; k)) / q',
            'HMAC_sha512(k || ι)'
        ]
     },
    {
        category: 'Science',
        question: 'Which specific cryptographic assumption guarantees that the transaction pair (P_tx, R) is computationally indistinguishable from random group elements?',
        correctAnswer: 'Decisional Diffie-Hellman (DDH)',
        incorrectAnswers: [
            'Computational Diffie-Hellman (CDH)',
            'Learning With Errors (LWE)',
            'Short Integer Solution (SIS)'
        ]
    },
    {
        category: 'Science',
        question: 'In the context of generalized predicates, what does the solver function S_pr(sk, m) return if the predicate cannot be satisfied?',
        correctAnswer: '⊥ (Bottom/Failure)',
        incorrectAnswers: [
            '0',
            'An empty string',
            'A random nonce'
        ]
    },
    {
        category: 'Science',
        question: 'In the Unicity Service state machine with predicates, how is the "System Time" (τ) variable maintained?',
        correctAnswer: 'It is a non-decreasing integer updated by the Consensus Layer',
        incorrectAnswers: [
            'It is a timestamp derived from the sender\'s local clock',
            'It is a median value of consensus node clocks',
            'It is calculated as the hash of the previous block'
        ]
    },
    {
        category: 'Science',
        question: 'In the security reductions presented in the paper, the "Time Overhead Function" τ(t) is generally assumed to be of what mathematical form?',
        correctAnswer: 'Linear (αt + β)',
        incorrectAnswers: [
            'Quadratic (at^2 + bt + c)',
            'Logarithmic (log t)',
            'Exponential (2^t)'
        ]
    },
    {
        category: 'Science',
        question: 'Unicity defines EF-CMA (Chosen Message Attack) for MPK schemes. How does this differ from the standard EF-CMA model?',
        correctAnswer: 'The adversary can initiate public key generation and choose indices',
        incorrectAnswers: [
            'The adversary has access to the private key',
            'The adversary cannot query the signing oracle',
            'The adversary must solve the Discrete Logarithm problem first'
        ]
    },
    {
        category: 'Science',
        question: 'In the definition of a Pseudo-Random Function (PRF) family, what technique is used to simulate the random oracle Φ?',
        correctAnswer: 'Lazy sampling',
        incorrectAnswers: [
            'Zero-knowledge proofs',
            'Homomorphic hiding',
            'Monte Carlo simulation'
        ]
    },
    {
        category: 'Science',
        question: 'Lemma 3.2 proves that a one-way function f remains hard to invert even if the adversary is given f(x) and what additional value?',
        correctAnswer: 'A perfectly hiding commitment Com(x)',
        incorrectAnswers: [
            'The first 8 bits of x',
            'A hash of the private key',
            'The random salt used in f'
        ]
    }
];

export const questions: TriviaQuestion[] = questionData.map((q, index) => ({
    ...q,
    id: String(index + 1),
}));

console.log('Exported ' + questions.length + ' questions');
