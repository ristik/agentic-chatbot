export interface TriviaQuestion {
    id: string;
    category: string;
    question: string;
    correctAnswer: string;
    incorrectAnswers: string[];
}

export const categories = ['Basics & Vision', 'Under the Hood', 'Security & Privacy',
    'Using Unicity', 'Building & Ecosystem'];

// TODO: Create better questions (and more of them)
export const questions: TriviaQuestion[] = [
    // --- CATEGORY 1: BASICS & VISION ---
    {
        id: '1',
        category: 'Basics & Vision',
        question: 'What is the primary "real-world" analogy used to describe how Unicity assets function?',
        correctAnswer: 'Physical Cash',
        incorrectAnswers: ['A bank account', 'A credit card', 'A shared spreadsheet']
    },
    {
        id: '2',
        category: 'Basics & Vision',
        question: 'Unlike traditional blockchains that share a global ledger, where do assets live in Unicity?',
        correctAnswer: 'Off-chain in Web2 environments',
        incorrectAnswers: ['On a centralized server', 'Inside the miners\' hardware', 'On the Ethereum mainnet']
    },
    {
        id: '3',
        category: 'Basics & Vision',
        question: 'What is the "Hair on fire" problem Unicity aims to solve?',
        correctAnswer: 'Financial access friction in emerging markets',
        incorrectAnswers: ['Slow video rendering speeds', 'High electricity costs of AI', 'The lack of VR content']
    },
    {
        id: '4',
        category: 'Basics & Vision',
        question: 'What makes Unicity assets "self-authenticating"?',
        correctAnswer: 'They can be validated by the recipient without external trust',
        incorrectAnswers: ['They use biometric scanning', 'They are backed by gold', 'They are printed on paper']
    },
    {
        id: '5',
        category: 'Basics & Vision',
        question: 'Which constraint does Unicity remove to achieve unlimited throughput?',
        correctAnswer: 'The need for global ordering of all transactions',
        incorrectAnswers: ['The need for electricity', 'The need for internet connectivity', 'The need for user passwords']
    },
    {
        id: '6',
        category: 'Basics & Vision',
        question: 'In the Unicity model, what is the blockchain primarily used for?',
        correctAnswer: 'Preventing double-spending (Uniqueness Proofs)',
        incorrectAnswers: ['Storing all user data', 'Executing every smart contract', 'Running the user interface']
    },
    {
        id: '7',
        category: 'Basics & Vision',
        question: 'How does Unicity view the famous "Blockchain Trilemma"?',
        correctAnswer: 'It solves it by moving execution off-chain',
        incorrectAnswers: ['It accepts it as an unavoidable law', 'It ignores it completely', 'It solves it using bigger blocks']
    },
    {
        id: '8',
        category: 'Basics & Vision',
        question: 'Which user group is Unicity specifically targeting to unlock a massive Total Addressable Market (TAM)?',
        correctAnswer: 'Users in emerging markets (e.g., Kinshasa, Bamako)',
        incorrectAnswers: ['Wall Street bankers', 'Silicon Valley developers', 'Crypto whales only']
    },
    {
        id: '9',
        category: 'Basics & Vision',
        question: 'What is the ultimate friction Unicity removes for the end-user?',
        correctAnswer: 'The need to know they are using blockchain at all',
        incorrectAnswers: ['The need to pay taxes', 'The need to have a smartphone', 'The need to download apps']
    },
    {
        id: '10',
        category: 'Basics & Vision',
        question: 'How does Unicity define "ownership" of a token?',
        correctAnswer: 'Control of the private key or predicate condition',
        incorrectAnswers: ['Possession of a receipt', 'Having a verified email', 'Being listed on a public website']
    },

    // --- CATEGORY 2: UNDER THE HOOD ---
    {
        id: '11',
        category: 'Under the Hood',
        question: 'What are the three hierarchical layers of the Unicity system?',
        correctAnswer: 'Consensus, Aggregation, and Execution',
        incorrectAnswers: ['Network, Transport, and Application', 'Layer 1, Layer 2, and Layer 3', 'Client, Server, and Database']
    },
    {
        id: '12',
        category: 'Under the Hood',
        question: 'What consensus mechanism does the Unicity Consensus Layer use?',
        correctAnswer: 'Proof of Work (RandomX)',
        incorrectAnswers: ['Proof of Stake', 'Proof of History', 'Delegated Proof of Stake']
    },
    {
        id: '13',
        category: 'Under the Hood',
        question: 'What is the specific role of the "Uniqueness Prover"?',
        correctAnswer: 'A Merkle tree that registers state transitions',
        incorrectAnswers: ['A robot that checks IDs', 'A specialized mining rig', 'A governance voting system']
    },
    {
        id: '14',
        category: 'Under the Hood',
        question: 'Why does Unicity use RandomX for its Proof of Work?',
        correctAnswer: 'To prevent mining centralization (ASIC resistance)',
        incorrectAnswers: ['Because it is the fastest', 'Because it uses less energy', 'Because it was created by AI']
    },
    {
        id: '15',
        category: 'Under the Hood',
        question: 'What is stored in the Aggregation Layer?',
        correctAnswer: 'A distributed append-only dictionary of spent states',
        incorrectAnswers: ['The full history of all transactions', 'User passwords and emails', 'Smart contract code']
    },
    {
        id: '16',
        category: 'Under the Hood',
        question: 'What does the Consensus Layer validate?',
        correctAnswer: 'The state transitions of the Aggregation Layer',
        incorrectAnswers: ['Every single user payment', 'The validity of smart contracts', 'The user\'s identity']
    },
    {
        id: '17',
        category: 'Under the Hood',
        question: 'Technically, every recipient of a Unicity transaction acts as a:',
        correctAnswer: 'Light client validator',
        incorrectAnswers: ['Centralized server', 'Passive observer', 'Data miner']
    },
    {
        id: '18',
        category: 'Under the Hood',
        question: 'What allows Unicity to scale linearly with the number of participants?',
        correctAnswer: 'Parallel, off-chain execution',
        incorrectAnswers: ['Larger block sizes', 'Faster internet speeds', 'More centralized servers']
    },
    {
        id: '19',
        category: 'Under the Hood',
        question: 'What is the "genesis record" in a Unicity token?',
        correctAnswer: 'The initial definition of token parameters (supply, metadata)',
        incorrectAnswers: ['The first transaction ever made', 'The founder\'s signature', 'A link to the whitepaper']
    },
    {
        id: '20',
        category: 'Under the Hood',
        question: 'What data structure is used to ensure the Aggregation Layer cannot "forget" spent states?',
        correctAnswer: 'Sparse Merkle Tree (SMT)',
        incorrectAnswers: ['Linked List', 'SQL Table', 'Binary Heap']
    },

    // --- CATEGORY 3: SECURITY & PRIVACY ---
    {
        id: '21',
        category: 'Security & Privacy',
        question: 'What are the three core security properties proved in the Unicity whitepaper?',
        correctAnswer: 'No double-spending, no blocking, and service-side privacy',
        incorrectAnswers: ['Speed, cost, and fun', 'KYC, AML, and CFT', 'Storage, compute, and networking']
    },
    {
        id: '22',
        category: 'Security & Privacy',
        question: 'How does Unicity ensure privacy from the service itself?',
        correctAnswer: 'Transactions are committed using perfectly hiding commitments',
        incorrectAnswers: ['By trusting the operators', 'By using a VPN', 'By deleting data daily']
    },
    {
        id: '23',
        category: 'Security & Privacy',
        question: 'What does "MPK" stand for in the context of Unicity\'s privacy?',
        correctAnswer: 'Multi-Public-Key (One secret, multiple unlinkable public keys)',
        incorrectAnswers: ['Massive Public Key', 'Multi-Party Knowledge', 'Mining Power Kilowatt']
    },
    {
        id: '24',
        category: 'Security & Privacy',
        question: 'What prevents a malicious actor from "blocking" a token (preventing it from being spent)?',
        correctAnswer: 'Only the legitimate owner can generate the spending signature',
        incorrectAnswers: ['A centralized whitelist', 'The network moderators', 'A voting DAO']
    },
    {
        id: '25',
        category: 'Security & Privacy',
        question: 'If you lose the device where your Unicity tokens are stored, what happens?',
        correctAnswer: 'They are lost, unless you have a backup (Self-Custody)',
        incorrectAnswers: ['Unicity can reset them', 'The bank refunds you', 'You can call support to restore them']
    },
    {
        id: '26',
        category: 'Security & Privacy',
        question: 'How does Unicity achieve "Transaction Identity Unlinkability"?',
        correctAnswer: 'Through symmetric blinding masks and ephemeral keys',
        incorrectAnswers: ['By mixing coins in a pool', 'By making all transactions public', 'By using a centralized privacy service']
    },
    {
        id: '27',
        category: 'Security & Privacy',
        question: 'What is the trust model of Unicity compared to Bitcoin?',
        correctAnswer: 'It replicates the "Trust No One" model',
        incorrectAnswers: ['It requires trusting a CEO', 'It is a federated model', 'It is weaker than Bitcoin']
    },
    {
        id: '28',
        category: 'Security & Privacy',
        question: 'Why doesn\'t Unicity need a "trusted setup" for its cryptography?',
        correctAnswer: 'It relies on standard cryptographic assumptions (like DL/DDH)',
        incorrectAnswers: ['It actually does need one', 'It uses proprietary math', 'It relies on hardware security only']
    },
    {
        id: '29',
        category: 'Security & Privacy',
        question: 'What protects the system from mining centralization?',
        correctAnswer: 'The RandomX algorithm',
        incorrectAnswers: ['High hardware costs', 'Government regulation', 'A closed miner list']
    },
    {
        id: '30',
        category: 'Security & Privacy',
        question: 'What happens if the Aggregation Layer tries to fork?',
        correctAnswer: 'The user/SDK can detect it via consistency proofs',
        incorrectAnswers: ['The internet shuts down', 'It is impossible to fork', 'The users lose all funds']
    },

    // --- CATEGORY 4: USING UNICITY ---
    {
        id: '31',
        category: 'Using Unicity',
        question: 'Can you use Unicity without an internet connection?',
        correctAnswer: 'Yes, via Offline Transactions',
        incorrectAnswers: ['No, internet is required', 'Only for viewing balances', 'Only on Sundays']
    },
    {
        id: '32',
        category: 'Using Unicity',
        question: 'What is the estimated cost of a Unicity infrastructure transaction?',
        correctAnswer: 'Less than $0.00000001 (negligible)',
        incorrectAnswers: ['$1.00', '$0.50', '$10.00']
    },
    {
        id: '33',
        category: 'Using Unicity',
        question: 'How are "Offline Transactions" eventually settled?',
        correctAnswer: 'They are posted online when connectivity is restored',
        incorrectAnswers: ['They are never posted', 'They settle via SMS', 'They require a physical visit to a bank']
    },
    {
        id: '34',
        category: 'Using Unicity',
        question: 'What is a "Nametag" in Unicity?',
        correctAnswer: 'An addressable, self-authenticated data structure for identity',
        incorrectAnswers: ['A physical sticker', 'A marketing banner', 'A tracking cookie']
    },
    {
        id: '35',
        category: 'Using Unicity',
        question: 'What mechanism allows Unicity to bridge assets from Ethereum?',
        correctAnswer: 'Lock-mint / Burn-release model',
        incorrectAnswers: ['Copy-paste model', 'Screenshot model', 'Trusted custodian model']
    },
    {
        id: '36',
        category: 'Using Unicity',
        question: 'Do you need a "Wallet Address" to receive a Unicity token?',
        correctAnswer: 'No, tokens can be transferred via email, NFC, or other channels',
        incorrectAnswers: ['Yes, always', 'Yes, and it must be KYC\'d', 'Yes, and it costs money']
    },
    {
        id: '37',
        category: 'Using Unicity',
        question: 'What allows developers to build on Unicity without learning Solidity?',
        correctAnswer: 'The State Transition SDK and Agents',
        incorrectAnswers: ['They must learn Solidity', 'A magic wand', 'There are no developer tools']
    },
    {
        id: '38',
        category: 'Using Unicity',
        question: 'In the "Carpatree" case study, what growth was achieved using Unicity?',
        correctAnswer: '21.6% growth in returning customers',
        incorrectAnswers: ['Zero growth', 'The app crashed', '50% user loss']
    },
    {
        id: '39',
        category: 'Using Unicity',
        question: 'How does Unicity handle transaction fees for developers?',
        correctAnswer: 'Likely a subscription model based on bands',
        incorrectAnswers: ['High gas fees per user', 'A percentage of all profits', 'It is strictly pay-per-click']
    },
    {
        id: '40',
        category: 'Using Unicity',
        question: 'Can Unicity be used as a Layer 2 for Solana?',
        correctAnswer: 'Yes, it is chain-agnostic and interoperable',
        incorrectAnswers: ['No, only Ethereum', 'No, only Bitcoin', 'It is a competitor only']
    },

    // --- CATEGORY 5: BUILDING & ECOSYSTEM ---
    {
        id: '41',
        category: 'Building & Ecosystem',
        question: 'What does Unicity use instead of traditional smart contracts?',
        correctAnswer: 'Agents',
        incorrectAnswers: ['Static Scripts', 'Centralized Databases', 'Manual Forms']
    },
    {
        id: '42',
        category: 'Building & Ecosystem',
        question: 'What is a "Predicate" in Unicity?',
        correctAnswer: 'A programmable condition (function) that defines ownership rules',
        incorrectAnswers: ['A type of database', 'A grammatical term', 'A hardware component']
    },
    {
        id: '43',
        category: 'Building & Ecosystem',
        question: 'In the "Quake" gaming example, where does the game logic run?',
        correctAnswer: 'Off-chain inside local agents, synchronized P2P',
        incorrectAnswers: ['On the Ethereum mainnet', 'On a central Blizzard server', 'On the miner\'s GPU']
    },
    {
        id: '44',
        category: 'Building & Ecosystem',
        question: 'What is a "CLOB Agent"?',
        correctAnswer: 'A Central Limit Order Book running off-chain',
        incorrectAnswers: ['A clumsy robot', 'A cleaning service', 'A type of shoe']
    },
    {
        id: '45',
        category: 'Building & Ecosystem',
        question: 'How do "Atomic Swaps" work in Unicity?',
        correctAnswer: 'Via escrow predicates implementing a 2-phase commit',
        incorrectAnswers: ['By trusting a middleman', 'By sending emails', 'By guessing']
    },
    {
        id: '46',
        category: 'Building & Ecosystem',
        question: 'What enables Unicity to run AI Agents efficiently?',
        correctAnswer: 'Untethered tokens and off-chain execution',
        incorrectAnswers: ['It uses a specialized AI coin', 'It restricts AI usage', 'It has a slow block time']
    },
    {
        id: '47',
        category: 'Building & Ecosystem',
        question: 'What does the Unicity State Transition SDK allow developers to do?',
        correctAnswer: 'Mint and transfer tokens using standard Web2 code',
        incorrectAnswers: ['Mine Bitcoin', 'Hack the Pentagon', 'Build hardware wallets']
    },
    {
        id: '48',
        category: 'Building & Ecosystem',
        question: 'Can Unicity support a decentralized exchange (DEX)?',
        correctAnswer: 'Yes, via agents executing AMM logic with verifiable certificates',
        incorrectAnswers: ['No, DeFi is impossible', 'Only centralized exchanges', 'Only if it copies Uniswap exactly']
    },
    {
        id: '49',
        category: 'Building & Ecosystem',
        question: 'What is "Single Asset Programmability"?',
        correctAnswer: 'Using predicates to customize rules for a specific token',
        incorrectAnswers: ['Programming only one token ever', 'A restrictive license', 'A simplistic wallet']
    },
    {
        id: '50',
        category: 'Building & Ecosystem',
        question: 'How does Unicity define a "DAO"?',
        correctAnswer: 'Web2 apps with logic on agents performing verifiable computations',
        incorrectAnswers: ['A Discord server', 'A group chat', 'A legal LLC']
    }
];

