import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { questions as defaultQuestions, categories, type TriviaQuestion } from './data/questions.js';
import { loadConfig, type Config } from './config.js';
import { IdentityService } from './identity-service.js';
import { NostrService } from './nostr-service.js';
import { PaymentTracker } from './payment-tracker.js';
import { WalletService } from './wallet-service.js';

export const DEFAULT_WINNING_STREAK = 10;

export interface TriviaServerOptions {
    random?: () => number;
    questions?: TriviaQuestion[];
    winningStreak?: number;
    // Payment services (optional for testing)
    nostrService?: NostrService;
    paymentTracker?: PaymentTracker;
    walletService?: WalletService;
    config?: Config;
}

export interface ActiveQuestion {
    question: TriviaQuestion;
    shuffledOptions: string[];
    createdAt: number;  // Unix timestamp in milliseconds
}

export interface TriviaServerState {
    currentQuestions: Map<string, ActiveQuestion>;
    scores: Map<string, number>;
}

// Pending payment waiters (for confirm_payment)
const pendingWaiters = new Map<string, {
    unicityId: string;
    waitForPayment: () => Promise<boolean>;
}>();

/**
 * Shuffles an array using the Fisher-Yates algorithm.
 * Returns a new shuffled array (does not mutate original).
 */
export const shuffleArray = <T>(array: T[], random: () => number): T[] => {
  const newArray = [...array];

  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }

  return newArray;
};

/**
 * Resolves a user's input to the specific option text if they typed a letter (a, b, c...),
 * otherwise returns their raw input trimmed.
 */
function resolveAnswerFromInput(input: string, options: string[]): string {
    const normalizedInput = input.toLowerCase().trim();
    const index = normalizedInput.charCodeAt(0) - 'a'.charCodeAt(0);

    // Check if input is a valid single-letter index within the bounds of the options
    if (normalizedInput.length === 1 && index >= 0 && index < options.length) {
        return options[index];
    }

    return input.trim();
}

export function createTriviaServer(options: TriviaServerOptions = {}): { server: McpServer; state: TriviaServerState } {
    const random = options.random ?? Math.random;
    const questions = options.questions ?? defaultQuestions;
    const winningStreak = options.winningStreak ?? DEFAULT_WINNING_STREAK;
    const nostrService = options.nostrService;
    const paymentTracker = options.paymentTracker;
    const walletService = options.walletService;
    const config = options.config;

    // Check if payment is enabled
    const paymentEnabled = !!(nostrService && paymentTracker && config);

    const server = new McpServer({
        name: 'trivia',
        version: '1.0.0',
    });

    const state: TriviaServerState = {
        currentQuestions: new Map(),
        scores: new Map(),
    };

    /**
     * Normalize user ID to prevent mismatches like "@alice" vs "alice"
     * @param rawId - Raw user ID from tool call
     * @returns Normalized user ID (lowercase, trimmed, @ prefix removed)
     */
    function normalizeUserId(rawId: string): string {
        return rawId
            .toLowerCase()
            .trim()
            .replace(/^@+/, '');  // Remove leading @ symbols
    }

    /**
     * Structured logger for trivia state operations
     */
    function logStateOperation(
        operation: 'get_question' | 'check_answer' | 'get_score',
        userId: string,
        details: Record<string, any>
    ) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            operation,
            userId,
            stateSize: {
                questions: state.currentQuestions.size,
                scores: state.scores.size,
            },
            ...details,
        };
        console.log(`[Trivia State] ${JSON.stringify(logEntry)}`);
    }

    function cleanupExpiredQuestions() {
        const now = Date.now();
        const EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
        let cleaned = 0;

        for (const [userId, activeQ] of state.currentQuestions.entries()) {
            if (now - activeQ.createdAt > EXPIRY_MS) {
                state.currentQuestions.delete(userId);
                cleaned++;
                console.log(`[Trivia] Expired question for user: ${userId} (age: ${Math.round((now - activeQ.createdAt) / 1000)}s)`);
            }
        }

        if (cleaned > 0) {
            console.log(`[Trivia] Cleanup: removed ${cleaned} expired question(s)`);
        }
    }
    setInterval(cleanupExpiredQuestions, 5 * 60 * 1000);

    // Tool: Check access (day pass status)
    server.tool(
        'check_access',
        'Check if user has valid day pass for trivia',
        {
            unicity_id: z.string().describe("User's Unicity ID (nametag)"),
        },
        async ({ unicity_id }) => {
            if (!paymentEnabled || !paymentTracker) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ hasAccess: true, message: 'Payment not required' }) }],
                };
            }

            const hasPass = paymentTracker.hasValidPass(unicity_id);
            const pass = paymentTracker.getPass(unicity_id);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        hasAccess: hasPass,
                        expiresAt: pass ? new Date(pass.expiresAt).toISOString() : null,
                    }),
                }],
            };
        }
    );

    // Tool: Get categories
    server.tool(
        'get_categories',
        'Get all available trivia categories',
        {},
        async () => ({
            content: [{ type: 'text', text: JSON.stringify({ categories }) }],
        })
    );

    // Tool: Get a question (with payment check when enabled)
    server.tool(
        'get_question',
        'Get a random trivia question, optionally filtered by category',
        {
            unicity_id: z.string().min(1).describe("User's Unicity ID (REQUIRED)"),
            category: z.string().optional().describe('Category to filter by'),
        },
        async ({ unicity_id, category }, extra) => {
            // Normalize and determine user ID
            const userId = normalizeUserId(unicity_id);
            console.log(`[Trivia] get_question - userId: "${userId}" (raw: "${unicity_id}")`);

            // Log state operation
            logStateOperation('get_question', userId, {
                category: category || 'random',
                hasExistingQuestion: state.currentQuestions.has(userId),
                currentScore: state.scores.get(userId) || 0,
            });

            // Check payment if enabled
            if (paymentEnabled && paymentTracker && nostrService && config) {
                console.log("Payment enabled");

                if (!unicity_id) {
                    console.log("User ID missing");
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ error: 'unicity_id is required for paid trivia' }) }],
                    };
                }

                if (!paymentTracker.hasValidPass(unicity_id)) {
                    console.log("Need to pay");
                    // Need to pay - send payment request
                    try {
                        const cleanId = unicity_id.replace("@unicity", "").replace("@", "").trim();
                        const userPubkey = await nostrService.resolvePubkey(cleanId);
                        console.log("User's public key: " + userPubkey);
                        if (!userPubkey) {
                            return {
                                content: [{
                                    type: 'text',
                                    text: JSON.stringify({
                                        error: 'Could not resolve Unicity ID',
                                        message: `No pubkey found for @${unicity_id}`,
                                    }),
                                }],
                            };
                        }

                        console.log("Will send payment request");
                        const { eventId, waitForPayment } = await nostrService.sendPaymentRequest(
                            unicity_id,
                            userPubkey
                        );

                        console.log("Will wait for response to the payment request");
                        // Store waiter for confirm_payment
                        pendingWaiters.set(eventId, { unicityId: unicity_id, waitForPayment });

                        const paymentReceived = waitForPayment().
                            then((paid) => {
                                if (paid) {
                                    console.log(`[Background] Payment received for ${unicity_id}! Granting pass.`);
                                    const pass = paymentTracker.grantDayPass(unicity_id);
                                } else {
                                    console.log(`[Background] Payment failed for ${eventId}`);
                                }
                                return paid;
                            })
                            .finally(() => {
                                pendingWaiters.delete(eventId);
                            });

                        console.log("Telling that day pass is required");
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    status: 'payment_required',
                                    message: 'Day pass required. Please approve the payment in your Unicity wallet.',
                                    eventId,
                                    timeoutSeconds: Math.floor(config.paymentTimeoutMs / 1000),
                                }),
                            }],
                        };
                    } catch (error) {
                        console.log("Error happened", error);
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    error: 'Failed to initiate payment',
                                    message: error instanceof Error ? error.message : String(error),
                                }),
                            }],
                        };
                    }
                }
            }

            // User has access (or payment not enabled) - return question
            let filtered = questions;
            if (category) {
                filtered = filtered.filter(q => q.category.toLowerCase() === category.toLowerCase());
            }

            if (filtered.length === 0) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ error: 'No questions found for criteria' }) }],
                };
            }

            const question = filtered[Math.floor(random() * filtered.length)];
            const shuffledOptions = shuffleArray([question.correctAnswer, ...question.incorrectAnswers], random);
            state.currentQuestions.set(userId, {
                question,
                shuffledOptions,
                createdAt: Date.now(),
            });

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        questionId: question.id,
                        category: question.category,
                        question: question.question,
                        options: shuffledOptions,
                    }),
                }],
            };
        }
    );

    // Tool: Confirm payment (wait for payment and grant day pass)
    server.tool(
        'confirm_payment',
        'Wait for payment confirmation and grant day pass',
        {
            event_id: z.string().describe('Payment request event ID'),
        },
        async ({ event_id }) => {
            if (!paymentEnabled || !paymentTracker) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ error: 'Payment not enabled on this server' }) }],
                };
            }

            const waiter = pendingWaiters.get(event_id);
            if (!waiter) {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({ error: 'No pending payment found for this event ID' }),
                    }],
                };
            }

            console.log(`[Trivia] Waiting for payment confirmation: ${event_id}`);

            const paymentReceived = await waiter.waitForPayment();
            pendingWaiters.delete(event_id);

            if (!paymentReceived) {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'timeout',
                            message: 'Payment not received in time. Please try again.',
                        }),
                    }],
                };
            }

            // Grant day pass
            const pass = paymentTracker.grantDayPass(waiter.unicityId);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        status: 'success',
                        message: 'Payment received! Your day pass is now active.',
                        expiresAt: new Date(pass.expiresAt).toISOString(),
                    }),
                }],
            };
        }
    );

    // Tool: Check answer
    server.tool(
        'check_answer',
        'Check if the provided answer is correct for the current question',
        {
            unicity_id: z.string().min(1).describe("User's Unicity ID (REQUIRED)"),
            answer: z.string().describe('The user\'s answer (text or letter a/b/c/d)'),
        },
        async ({ unicity_id, answer }, extra) => {
            const userId = normalizeUserId(unicity_id);
            console.log(`[Trivia] check_answer - userId: "${userId}" (raw: "${unicity_id}")`);

            const activeQuestion = state.currentQuestions.get(userId);

            if (!activeQuestion) {
                logStateOperation('check_answer', userId, {
                    error: 'no_active_question',
                    availableUserIds: Array.from(state.currentQuestions.keys()),
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify({ error: 'No active question. Get a question first.' }) }],
                };
            }

            logStateOperation('check_answer', userId, {
                questionId: activeQuestion.question.id,
                userAnswer: answer,
            });

            const { question, shuffledOptions } = activeQuestion;

            const answerText = resolveAnswerFromInput(answer, shuffledOptions);

            const isCorrect = answerText.toLowerCase() === question.correctAnswer.toLowerCase();

            let newScore: number;
            let award = false;

            if (isCorrect) {
                newScore = (state.scores.get(userId) || 0) + 1;
                if (newScore >= winningStreak) {
                    award = true;
                    // TODO: Actually send NFT to userId here (see PLAN_NFT_SENDING.md)
                    console.log(`[Trivia] User ${userId} earned an award! Sending NFT...`);
                    state.scores.set(userId, 0); // Reset after award
                } else {
                    state.scores.set(userId, newScore);
                }
            } else {
                newScore = 0;
                state.scores.set(userId, 0);
            }

            state.currentQuestions.delete(userId);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        correct: isCorrect,
                        correctAnswer: question.correctAnswer,
                        explanation: isCorrect
                            ? 'Great job!'
                            : `The correct answer was: ${question.correctAnswer}`,
                        newScore,
                        ...(award && { award: true }),
                    }),
                }],
            };
        }
    );

    // Tool: Get score
    server.tool(
        'get_score',
        'Get the current score for the user',
        {
            unicity_id: z.string().min(1).describe("User's Unicity ID (REQUIRED)"),
        },
        async ({ unicity_id }, extra) => {
            const userId = normalizeUserId(unicity_id);
            console.log(`[Trivia] get_score - userId: "${userId}" (raw: "${unicity_id}")`);

            logStateOperation('get_score', userId, {
                score: state.scores.get(userId) || 0,
                hasActiveQuestion: state.currentQuestions.has(userId),
            });

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({ score: state.scores.get(userId) || 0 }),
                }],
            };
        }
    );

    // Tool: Get wallet balance (admin only)
    server.tool(
        'get_wallet_balance',
        'Get the wallet balance for the trivia server (admin only)',
        {
            admin_password: z.string().describe('Admin password for authentication'),
        },
        async ({ admin_password }) => {
            if (!config || !walletService) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ error: 'Wallet service not available' }) }],
                };
            }

            if (admin_password !== config.adminPassword) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid admin password' }) }],
                };
            }

            try {
                const summary = await walletService.getWalletSummary();
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            totalTokens: summary.totalTokens,
                            balances: summary.balances.map(b => ({
                                coinId: b.coinId,
                                amount: b.amount.toString(),
                                tokenCount: b.tokenCount,
                            })),
                        }),
                    }],
                };
            } catch (error) {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            error: 'Failed to get wallet balance',
                            message: error instanceof Error ? error.message : String(error),
                        }),
                    }],
                };
            }
        }
    );

    return { server, state };
}

// Start server with HTTP transport
async function main() {
    let config: Config;
    let identityService: IdentityService | null = null;
    let nostrService: NostrService | null = null;
    let paymentTracker: PaymentTracker | null = null;
    let walletService: WalletService | null = null;

    // Try to load payment config
    try {
        config = loadConfig();

        console.log('[Trivia] Payment configuration loaded');
        console.log(`[Trivia] Nametag: @${config.nametag}`);

        // Initialize payment services
        identityService = new IdentityService(config);
        await identityService.initialize();

        nostrService = new NostrService(config, identityService);
        await nostrService.connect();

        paymentTracker = new PaymentTracker(config.dayPassHours);
        walletService = new WalletService(config);

        console.log('[Trivia] Payment services initialized');
    } catch (error) {
        console.log('[Trivia] Payment not configured, running in free mode');
        console.log(`[Trivia] Reason: ${error instanceof Error ? error.message : String(error)}`);
        console.log(error);

        // Create minimal config for non-payment mode
        config = {
            port: parseInt(process.env.PORT || '3001', 10),
            winningStreak: parseInt(process.env.WINNING_STREAK || '10', 10),
        } as Config;
    }

    const port = config.port || parseInt(process.env.PORT || '3001', 10);
    const winningStreak = config.winningStreak || DEFAULT_WINNING_STREAK;
    console.log(`[Trivia] Winning streak set to: ${winningStreak}`);

    const { server } = createTriviaServer({
        winningStreak,
        nostrService: nostrService || undefined,
        paymentTracker: paymentTracker || undefined,
        walletService: walletService || undefined,
        config: nostrService ? config : undefined,
    });

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
    });

    await server.connect(transport);

    const httpServer = createServer((req, res) => {
        if (req.url === '/mcp') {
            transport.handleRequest(req, res);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    httpServer.listen(port, () => {
        console.log(`Trivia MCP server running on port ${port}`);
    });
}

// Only start server when run directly (not imported for testing)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
    main().catch(console.error);
}
