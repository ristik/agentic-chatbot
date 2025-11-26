import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { questions, categories, scores, type TriviaQuestion } from './data/questions.js';

const server = new McpServer({
    name: 'trivia',
    version: '1.0.0',
});

// Track current question per user
const currentQuestions: Map<string, TriviaQuestion> = new Map();

// Tool: Get categories
server.tool(
    'get_categories',
    'Get all available trivia categories',
    {},
    async () => ({
        content: [{ type: 'text', text: JSON.stringify({ categories }) }],
    })
);

// Tool: Get a question
server.tool(
    'get_question',
    'Get a random trivia question, optionally filtered by category',
    {
        category: z.string().optional().describe('Category to filter by'),
        difficulty: z.enum(['easy', 'medium', 'hard']).optional().describe('Difficulty level'),
    },
    async ({ category, difficulty }, extra) => {
        const userId = (extra as any)?.meta?.userId || 'anonymous';

        let filtered = questions;
        if (category) {
            filtered = filtered.filter(q => q.category.toLowerCase() === category.toLowerCase());
        }
        if (difficulty) {
            filtered = filtered.filter(q => q.difficulty === difficulty);
        }

        if (filtered.length === 0) {
            return {
                content: [{ type: 'text', text: JSON.stringify({ error: 'No questions found for criteria' }) }],
            };
        }

        const question = filtered[Math.floor(Math.random() * filtered.length)];
        currentQuestions.set(userId, question);

        // Shuffle answers
        const allAnswers = [question.correctAnswer, ...question.incorrectAnswers]
            .sort(() => Math.random() - 0.5);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    questionId: question.id,
                    category: question.category,
                    difficulty: question.difficulty,
                    question: question.question,
                    options: allAnswers,
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
        answer: z.string().describe('The user\'s answer'),
    },
    async ({ answer }, extra) => {
        const userId = (extra as any)?.meta?.userId || 'anonymous';
        const question = currentQuestions.get(userId);

        if (!question) {
            return {
                content: [{ type: 'text', text: JSON.stringify({ error: 'No active question. Get a question first.' }) }],
            };
        }

        const isCorrect = answer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();

        if (isCorrect) {
            const currentScore = scores.get(userId) || 0;
            scores.set(userId, currentScore + 1);
        }

        currentQuestions.delete(userId);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    correct: isCorrect,
                    correctAnswer: question.correctAnswer,
                    explanation: isCorrect
                        ? 'Great job!'
                        : `The correct answer was: ${question.correctAnswer}`,
                    newScore: scores.get(userId) || 0,
                }),
            }],
        };
    }
);

// Tool: Get score
server.tool(
    'get_score',
    'Get the current score for the user',
    {},
    async (_, extra) => {
        const userId = (extra as any)?.meta?.userId || 'anonymous';
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({ score: scores.get(userId) || 0 }),
            }],
        };
    }
);

// Start server with HTTP transport
async function main() {
    const port = parseInt(process.env.PORT || '3001');

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

main().catch(console.error);
