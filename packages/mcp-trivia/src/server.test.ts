import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createTriviaServer, type TriviaServerState } from './server.js';
import { categories, type TriviaQuestion } from './data/questions.js';

const TEST_QUESTIONS: TriviaQuestion[] = [
    {
        id: 'test-1',
        category: 'Test Category',
        question: 'What is 2 + 2?',
        correctAnswer: 'Four',
        incorrectAnswers: ['Three', 'Five', 'Six'],
    },
    {
        id: 'test-2',
        category: 'Test Category',
        question: 'What color is the sky?',
        correctAnswer: 'Blue',
        incorrectAnswers: ['Green', 'Red', 'Yellow'],
    },
    {
        id: 'test-3',
        category: 'Other Category',
        question: 'What is the capital of France?',
        correctAnswer: 'Paris',
        incorrectAnswers: ['London', 'Berlin', 'Madrid'],
    },
];

function createSeededRandom(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}

interface TestContext {
    client: Client;
    state: TriviaServerState;
}

async function setupTest(options: { random?: () => number; questions?: TriviaQuestion[] } = {}): Promise<TestContext> {
    const { server, state } = createTriviaServer({
        random: options.random ?? createSeededRandom(42),
        questions: options.questions ?? TEST_QUESTIONS,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
    ]);

    return { client, state };
}

function parseToolResult(result: Awaited<ReturnType<Client['callTool']>>): unknown {
    const content = result.content[0];
    if (content.type !== 'text') throw new Error('Expected text content');
    return JSON.parse(content.text);
}

describe('MCP Trivia Server', () => {
    describe('get_categories', () => {
        it('returns all available categories', async () => {
            const { client } = await setupTest();

            const result = await client.callTool({ name: 'get_categories', arguments: {} });
            const data = parseToolResult(result) as { categories: string[] };

            expect(data.categories).toEqual(categories);
        });
    });

    describe('get_question', () => {
        it('returns a question with shuffled options', async () => {
            const { client } = await setupTest();

            const result = await client.callTool({ name: 'get_question', arguments: {} });
            const data = parseToolResult(result) as {
                questionId: string;
                category: string;
                question: string;
                options: string[];
            };

            expect(JSON.stringify(data)).toEqual(
                '{"questionId":"test-2","category":"Test Category","question":"What color is the sky?","options":["Blue","Green","Yellow","Red"]}');
        });

        it('returns deterministic results with seeded random', async () => {
            const { client: client1 } = await setupTest({ random: createSeededRandom(123) });
            const { client: client2 } = await setupTest({ random: createSeededRandom(123) });

            const result1 = await client1.callTool({ name: 'get_question', arguments: {} });
            const result2 = await client2.callTool({ name: 'get_question', arguments: {} });

            expect(parseToolResult(result1)).toEqual(parseToolResult(result2));
        });

        it('filters by category (case-insensitive)', async () => {
            const { client } = await setupTest();

            const result = await client.callTool({
                name: 'get_question',
                arguments: { category: 'test category' },
            });
            const data = parseToolResult(result) as { category: string };

            expect(data.category).toBe('Test Category');
        });

        it('returns error for non-existent category', async () => {
            const { client } = await setupTest();

            const result = await client.callTool({
                name: 'get_question',
                arguments: { category: 'Non Existent' },
            });
            const data = parseToolResult(result) as { error: string };

            expect(data.error).toBe('No questions found for criteria');
        });

        it('stores current question in state', async () => {
            const { client, state } = await setupTest();

            await client.callTool({ name: 'get_question', arguments: {} });

            expect(JSON.stringify(state.currentQuestions.get('anonymous'))).toEqual(
                '{"id":"test-2","category":"Test Category","question":"What color is the sky?","correctAnswer":"Blue","incorrectAnswers":["Green","Red","Yellow"]}');
        });
    });

    describe('check_answer', () => {
        it('returns error when no active question', async () => {
            const { client } = await setupTest();

            const result = await client.callTool({
                name: 'check_answer',
                arguments: { answer: 'Four' },
            });
            const data = parseToolResult(result) as { error: string };

            expect(data.error).toBe('No active question. Get a question first.');
        });

        it('accepts correct answer (case-insensitive, trimmed)', async () => {
            const { client, state } = await setupTest();
            state.currentQuestions.set('anonymous', TEST_QUESTIONS[0]);

            const result = await client.callTool({
                name: 'check_answer',
                arguments: { answer: '  four  ' },
            });
            const data = parseToolResult(result) as {
                correct: boolean;
                correctAnswer: string;
                explanation: string;
                newScore: number;
            };

            expect(data.correct).toBe(true);
            expect(data.correctAnswer).toBe('Four');
            expect(data.explanation).toBe('Great job!');
            expect(data.newScore).toBe(1);
        });

        it('rejects incorrect answer', async () => {
            const { client, state } = await setupTest();
            state.currentQuestions.set('anonymous', TEST_QUESTIONS[0]);

            const result = await client.callTool({
                name: 'check_answer',
                arguments: { answer: 'Five' },
            });
            const data = parseToolResult(result) as {
                correct: boolean;
                correctAnswer: string;
                explanation: string;
            };

            expect(data.correct).toBe(false);
            expect(data.explanation).toBe('The correct answer was: Four');
        });

        it('clears current question after answering', async () => {
            const { client, state } = await setupTest();
            state.currentQuestions.set('anonymous', TEST_QUESTIONS[0]);

            await client.callTool({ name: 'check_answer', arguments: { answer: 'Four' } });

            expect(state.currentQuestions.get('anonymous')).toBeUndefined();
        });

        it('increments score only for correct answers', async () => {
            const { client, state } = await setupTest();

            state.currentQuestions.set('anonymous', TEST_QUESTIONS[0]);
            await client.callTool({ name: 'check_answer', arguments: { answer: 'Wrong' } });
            expect(state.scores.get('anonymous') ?? 0).toBe(0);

            state.currentQuestions.set('anonymous', TEST_QUESTIONS[0]);
            await client.callTool({ name: 'check_answer', arguments: { answer: 'Four' } });
            expect(state.scores.get('anonymous')).toBe(1);

            state.currentQuestions.set('anonymous', TEST_QUESTIONS[1]);
            await client.callTool({ name: 'check_answer', arguments: { answer: 'Blue' } });
            expect(state.scores.get('anonymous')).toBe(2);
        });
    });

    describe('get_score', () => {
        it('returns zero for new user', async () => {
            const { client } = await setupTest();

            const result = await client.callTool({ name: 'get_score', arguments: {} });
            const data = parseToolResult(result) as { score: number };

            expect(data.score).toBe(0);
        });

        it('returns accumulated score', async () => {
            const { client, state } = await setupTest();
            state.scores.set('anonymous', 5);

            const result = await client.callTool({ name: 'get_score', arguments: {} });
            const data = parseToolResult(result) as { score: number };

            expect(data.score).toBe(5);
        });
    });

    describe('full game flow', () => {
        it('plays a complete trivia round', async () => {
            const { client } = await setupTest();

            // Check initial score
            let result = await client.callTool({ name: 'get_score', arguments: {} });
            expect((parseToolResult(result) as { score: number }).score).toBe(0);

            // Get a question
            result = await client.callTool({ name: 'get_question', arguments: {} });
            const question = parseToolResult(result) as {
                questionId: string;
                options: string[];
            };
            expect(question.options).toHaveLength(4);

            // Answer correctly (we know the test data)
            const correctAnswer = TEST_QUESTIONS.find(q => q.id === question.questionId)!.correctAnswer;
            result = await client.callTool({
                name: 'check_answer',
                arguments: { answer: correctAnswer },
            });
            const answerResult = parseToolResult(result) as { correct: boolean; newScore: number };
            expect(answerResult.correct).toBe(true);
            expect(answerResult.newScore).toBe(1);

            // Verify score persisted
            result = await client.callTool({ name: 'get_score', arguments: {} });
            expect((parseToolResult(result) as { score: number }).score).toBe(1);
        });
    });
});
