import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import path from 'path';
import { getDb, getFieldValue } from './firebase.js';
import { useFileAuthState, removeSessionFolder } from './store.js';
import { log, logWarn, logError } from './logger.js';

const SESSION_DIR = process.env.SESSION_DIR || './sessions';
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 5000;

// Map: botId → session context
const activeSessions = new Map();

/* ============================================================
   START BOT SESSION
   ============================================================ */
export async function startBotSession(uid, botId, botData) {
  if (activeSessions.has(botId)) {
    log('BotManager', `Bot ${botId} sudah aktif, skip`);
    return;
  }

  const sessionPath = path.join(SESSION_DIR, `${uid}_${botId}`);
  const sessionDir = path.join(process.cwd(), sessionPath);

  log('BotManager', `▶ Memulai bot: ${botId} (${botData.name}) · ${botData.method}`);

  // Set status = starting
  await updateBotStatus(uid, botId, {
    status: 'starting',
    startedAt: getFieldValue().serverTimestamp()
  });

  try {
    const { state, saveCreds } = await useFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: { level: 'silent', child: () => ({ level: 'silent', child: () => ({}) }) },
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, { level: 'silent' })
      },
      browser: Browsers.macOS('Desktop'),
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      getMessage: async () => undefined
    });

    const sessionCtx = {
      sock,
      uid,
      botId,
      botData,
      reconnecting: false,
      reconnectAttempts: 0,
      sessionDir
    };
    activeSessions.set(botId, sessionCtx);

    /* ============ PAIRING CODE ============ */
    if (
      botData.method === 'pairing' &&
      botData.botPhone &&
      !sock.authState.creds.registered
    ) {
      setTimeout(async () => {
        try {
          const phoneNumber = String(botData.botPhone).replace(/[^0-9]/g, '');
          log('BotManager', `Request pairing code untuk ${phoneNumber}...`);
          const code = await sock.requestPairingCode(phoneNumber);
          const formatted = code?.match(/.{1,4}/g)?.join('-') || code;

          await updateBotStatus(uid, botId, {
            status: 'pending',
            pairingCode: formatted,
            actualCode: code,
            pairingRequestedAt: getFieldValue().serverTimestamp()
          });

          log('BotManager', `✓ Pairing code untuk ${botId}: ${formatted}`);
        } catch (err) {
          logError('BotManager', `Pairing code error ${botId}`, err);
          await updateBotStatus(uid, botId, {
            status: 'error',
            lastError: 'Pairing code gagal: ' + err.message
          });
        }
      }, 3000);
    }

    /* ============ SAVE CREDS ============ */
    sock.ev.on('creds.update', saveCreds);

    /* ============ CONNECTION UPDATE ============ */
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR diterima
      if (qr && botData.method === 'qr') {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, {
            width: 400,
            margin: 1,
            color: { dark: '#0a0a0a', light: '#ffffff' }
          });
          await updateBotStatus(uid, botId, {
            status: 'pending',
            qrData: qr,
            qrDataUrl,
            qrUpdatedAt: getFieldValue().serverTimestamp()
          });
          log('BotManager', `📱 QR baru untuk ${botId}`);
        } catch (err) {
          logError('BotManager', 'QR generate error', err);
        }
      }

      // Connected
      if (connection === 'open') {
        log('BotManager', `✓ Bot ${botId} TERHUBUNG!`);
        sessionCtx.reconnectAttempts = 0;

        const deviceInfo = sock.user || {};

        await updateBotStatus(uid, botId, {
          status: 'connected',
          connectedAt: getFieldValue().serverTimestamp(),
          device: deviceInfo.name || 'WhatsApp Web',
          deviceJid: deviceInfo.id || null,
          devicePlatform: deviceInfo.platform || 'web',
          lastError: null,
          qrData: null,
          qrDataUrl: null,
          pairingCode: null,
          actualCode: null
        });

        await addActivity(
          uid,
          'Bot terhubung',
          `Bot "${botData.name}" berhasil terhubung ke WhatsApp`,
          '✅'
        );
      }

      // Closed
      if (connection === 'close') {
        const statusCode =
          lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output?.statusCode
            : null;

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        logWarn(
          'BotManager',
          `Bot ${botId} terputus. Code: ${statusCode}, reconnect: ${shouldReconnect}`
        );

        if (statusCode === DisconnectReason.loggedOut) {
          await updateBotStatus(uid, botId, {
            status: 'disconnected',
            disconnectedAt: getFieldValue().serverTimestamp(),
            disconnectReason: 'logged_out'
          });
          await addActivity(uid, 'Bot logout', `Bot "${botData.name}" logout`, '🚪');
          await cleanupSession(botId);
          await removeSessionFolder(sessionCtx.sessionDir);
        } else if (
          shouldReconnect &&
          sessionCtx.reconnectAttempts < MAX_RECONNECT_ATTEMPTS
        ) {
          sessionCtx.reconnectAttempts++;
          sessionCtx.reconnecting = true;

          await updateBotStatus(uid, botId, {
            status: 'reconnecting',
            reconnectAttempts: sessionCtx.reconnectAttempts
          });

          activeSessions.delete(botId);
          setTimeout(() => {
            startBotSession(uid, botId, botData).catch((err) => {
              logError('BotManager', `Reconnect gagal ${botId}`, err);
            });
          }, RECONNECT_DELAY);
        } else {
          await updateBotStatus(uid, botId, {
            status: 'disconnected',
            disconnectedAt: getFieldValue().serverTimestamp(),
            disconnectReason: statusCode ? `code_${statusCode}` : 'unknown'
          });
          await cleanupSession(botId);
        }
      }
    });

    /* ============ MESSAGES ============ */
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.key.fromMe) {
          try {
            await getDb()
              .collection('users')
              .doc(uid)
              .collection('bots')
              .doc(botId)
              .update({
                messagesReceived: getFieldValue().increment(1),
                lastActivityAt: getFieldValue().serverTimestamp()
              });
          } catch (e) {}
        }
      }
    });

    return sock;
  } catch (err) {
    logError('BotManager', `Gagal start bot ${botId}`, err);
    await updateBotStatus(uid, botId, {
      status: 'error',
      lastError: err.message
    });
    throw err;
  }
}

/* ============================================================
   STOP SESSION
   ============================================================ */
export async function stopBotSession(botId, logout = false) {
  const session = activeSessions.get(botId);
  if (!session) return;

  try {
    if (logout) {
      await session.sock.logout().catch(() => {});
    } else {
      await session.sock.end?.();
    }
  } catch (e) {}

  activeSessions.delete(botId);
  log('BotManager', `Bot ${botId} dihentikan`);
}

async function cleanupSession(botId) {
  const session = activeSessions.get(botId);
  if (session) {
    try {
      await session.sock.end?.();
    } catch (e) {}
    activeSessions.delete(botId);
  }
}

/* ============================================================
   FIRESTORE HELPERS
   ============================================================ */
async function updateBotStatus(uid, botId, updates) {
  try {
    await getDb()
      .collection('users')
      .doc(uid)
      .collection('bots')
      .doc(botId)
      .set(updates, { merge: true });
  } catch (err) {
    logError('BotManager', `Update status error ${botId}`, err);
  }
}

async function addActivity(uid, title, desc, icon = '📝') {
  try {
    await getDb()
      .collection('users')
      .doc(uid)
      .collection('activities')
      .add({
        title,
        desc,
        icon,
        timestamp: getFieldValue().serverTimestamp()
      });
  } catch (e) {}
}

/* ============================================================
   EXPORT HELPERS
   ============================================================ */
export function getActiveSessionCount() {
  return activeSessions.size;
}

export function getActiveBotIds() {
  return Array.from(activeSessions.keys());
}

export async function stopAllSessions() {
  const ids = Array.from(activeSessions.keys());
  for (const id of ids) {
    await stopBotSession(id, false);
  }
}
