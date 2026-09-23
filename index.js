import 'dotenv/config';
import { initFirebase } from './src/firebase.js';
import { stopAllSessions, getActiveSessionCount } from './src/botManager.js';
import { startWatcher, stopWatcher } from './src/watcher.js';
import { log, logError } from './src/logger.js';

let isShuttingDown = false;

/* ============================================================
   STARTUP
   ============================================================ */
async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║                                                   ║');
  console.log('║    HunzAi-O51W — WhatsApp Bot Backend             ║');
  console.log('║    Version 1.0.0                                  ║');
  console.log('║                                                   ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');

  try {
    initFirebase();
    log('Main', '✓ Firebase initialized');
  } catch (err) {
    logError('Main', 'Firebase init gagal', err);
    process.exit(1);
  }

  log('Main', 'Starting watcher...');
  startWatcher();

  log('Main', '✓ Backend siap menerima bot baru');

  // Health log
  setInterval(() => {
    log('Health', `Active sessions: ${getActiveSessionCount()}`);
  }, 60000);
}

/* ============================================================
   GRACEFUL SHUTDOWN
   ============================================================ */
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log('Main', `\nReceived ${signal}, shutting down...`);

  stopWatcher();

  try {
    await stopAllSessions();
    log('Main', '✓ Semua sesi dihentikan');
  } catch (err) {
    logError('Main', 'Shutdown error', err);
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logError('Main', 'Uncaught exception', err);
});

process.on('unhandledRejection', (reason) => {
  logError(
    'Main',
    'Unhandled rejection',
    reason instanceof Error ? reason : new Error(String(reason))
  );
});

/* ============================================================
   RUN
   ============================================================ */
main().catch((err) => {
  logError('Main', 'Fatal error', err);
  process.exit(1);
});
