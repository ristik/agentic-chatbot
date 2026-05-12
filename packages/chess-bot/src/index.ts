import { ChessBot } from './chess-bot.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const bot = new ChessBot(config);

bot.start().catch((error) => {
  console.error('[chess-bot] Fatal:', error);
  process.exit(1);
});

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) {
    // Second signal: operator pressing Ctrl+C twice or docker following
    // SIGTERM with SIGKILL — let the existing drain finish (or fail fast).
    console.log(`[chess-bot] ${signal} received again — already shutting down`);
    return;
  }
  shuttingDown = true;
  console.log(`[chess-bot] ${signal} received — starting graceful drain`);
  try {
    await bot.drain();
  } catch (err) {
    console.error('[chess-bot] Error during shutdown:', err);
  }
  process.exit(0);
};

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
