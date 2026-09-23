import { getDb, getFieldValue } from './firebase.js';
import { startBotSession, getActiveBotIds } from './botManager.js';
import { log, logError } from './logger.js';

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 10000;
const BOT_TIMEOUT_MS = parseInt(process.env.BOT_TIMEOUT_MS) || 15 * 60 * 1000;

let isRunning = false;
let pollTimer = null;
let stopped = false;

/* ============================================================
   SCAN & START
   ============================================================ */
async function scanAndStartBots() {
  if (isRunning || stopped) return;
  isRunning = true;

  try {
    const db = getDb();
    const usersSnap = await db.collection('users').get();

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;

      const botsSnap = await db
        .collection('users')
        .doc(uid)
        .collection('bots')
        .where('status', 'in', ['pending', 'reconnecting', 'starting'])
        .get();

      for (const botDoc of botsSnap.docs) {
        const botId = botDoc.id;
        const botData = botDoc.data();

        if (getActiveBotIds().includes(botId)) continue;

        // Cek timeout
        const startedAt = botData.connectionStartedAt?.toDate?.();
        if (startedAt && Date.now() - startedAt.getTime() > BOT_TIMEOUT_MS) {
          log('Scanner', `Bot ${botId} expired (>${BOT_TIMEOUT_MS / 60000} menit)`);
          await db
            .collection('users')
            .doc(uid)
            .collection('bots')
            .doc(botId)
            .update({
              status: 'error',
              lastError: `Connection timeout (>${Math.round(BOT_TIMEOUT_MS / 60000)} menit)`
            });
          continue;
        }

        log('Scanner', `Start bot ${botId} (${botData.name})`);

        startBotSession(uid, botId, botData).catch((err) => {
          logError('Scanner', `Gagal start ${botId}`, err);
        });
      }
    }
  } catch (err) {
    logError('Scanner', 'Scan error', err);
  } finally {
    isRunning = false;
  }
}

/* ============================================================
   START / STOP
   ============================================================ */
export function startWatcher() {
  if (pollTimer) return;
  log('Watcher', `Polling setiap ${POLL_INTERVAL / 1000}s`);

  scanAndStartBots();
  pollTimer = setInterval(scanAndStartBots, POLL_INTERVAL);
}

export function stopWatcher() {
  stopped = true;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
