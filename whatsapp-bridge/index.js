const http = require('http');
const path = require('path');
const fs = require('fs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');

const PORT = process.env.WHATSAPP_PORT || 3001;
const AUTH_DIR = path.resolve(process.env.HOTEL_CRM_WHATSAPP_DATA || __dirname, 'auth_info_baileys');

// State management
let sock = null;
let currentQrDataUrl = null;
let connectionStatus = 'DISCONNECTED'; // 'DISCONNECTED' | 'SCAN_QR' | 'CONNECTING' | 'CONNECTED'
let connectedPhone = null;
let connectedName = null;

const logger = pino({ level: 'silent' });

async function initWhatsApp() {
  connectionStatus = 'CONNECTING';

  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ['HOTEL CRM Desktop', 'Desktop', '1.0.0'],
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionStatus = 'SCAN_QR';
      try {
        currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 7 });
      } catch (err) {
        currentQrDataUrl = null;
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      connectionStatus = 'DISCONNECTED';
      currentQrDataUrl = null;
      connectedPhone = null;
      connectedName = null;

      if (statusCode === DisconnectReason.loggedOut) {
        // Clear auth directory on explicit logout
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        } catch {}
      }

      if (shouldReconnect) {
        setTimeout(initWhatsApp, 4000);
      }
    } else if (connection === 'open') {
      connectionStatus = 'CONNECTED';
      currentQrDataUrl = null;
      connectedPhone = sock?.user?.id?.split(':')[0] || sock?.user?.id || 'Connected';
      connectedName = sock?.user?.name || 'Restaurant Official';
    }
  });
}

// HTTP API Server (Native Node http, zero express bloat)
const allowedOrigins = new Set(['http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost', 'http://localhost:4200', 'http://127.0.0.1:4200']);
const server = http.createServer(async (req, res) => {
  // CORS Headers for Desktop & Localhost
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    res.writeHead(403).end();
    return;
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://127.0.0.1');
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ') || auth.length < 16) {
    res.writeHead(401).end();
    return;
  }
  try {
    const session = await fetch('http://127.0.0.1:3000/api/v1/auth/me', {
      headers: { Authorization: auth }, signal: AbortSignal.timeout(3000), redirect: 'error',
    });
    if (!session.ok) { res.writeHead(401).end(); return; }
    const role = String((await session.json()).data?.role || '').toUpperCase();
    if (url.pathname === '/logout' && role !== 'ADMIN') { res.writeHead(403).end(); return; }
    if (url.pathname === '/status' && role !== 'ADMIN') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: connectionStatus, qr: null, phone: null, name: null }));
      return;
    }
  } catch {
    res.writeHead(503).end();
    return;
  }

  // 1. GET /status — Returns connection state & active QR code
  if (req.method === 'GET' && url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: connectionStatus,
        qr: currentQrDataUrl,
        phone: connectedPhone,
        name: connectedName,
      })
    );
    return;
  }

  // 2. POST /send — Dispatches a text message (Bill/Receipt)
  if (req.method === 'POST' && url.pathname === '/send') {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= 32768) body += chunk;
    });
    req.on('end', async () => {
      try {
        if (size > 32768) { res.writeHead(413).end(); return; }
        const payload = JSON.parse(body || '{}');
        let { phone, message } = payload;

        if (!phone || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Phone and message are required' }));
          return;
        }

        if (connectionStatus !== 'CONNECTED' || !sock) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: false,
              error: 'WhatsApp is not connected. Please scan QR in Settings.',
            })
          );
          return;
        }

        // Format phone number to WhatsApp JID: 919876543210 -> 919876543210@s.whatsapp.net
        let cleanDigits = phone.replace(/\D/g, '');
        if (cleanDigits.length === 10) {
          cleanDigits = '91' + cleanDigits; // Default India prefix if 10 digits
        }
        const jid = `${cleanDigits}@s.whatsapp.net`;

        const sent = await sock.sendMessage(jid, { text: message });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            messageId: sent?.key?.id,
            timestamp: sent?.messageTimestamp,
          })
        );
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err?.message || 'Send failed' }));
      }
    });
    return;
  }

  // 3. POST /disconnect /logout — Clears session & requests logout
  if (req.method === 'POST' && url.pathname === '/logout') {
    try {
      if (sock) {
        await sock.logout().catch(() => {});
      }
      try {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      } catch {}
      initWhatsApp().catch(() => {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Logged out successfully' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  initWhatsApp().catch(err => {
    connectionStatus = 'DISCONNECTED';
    console.error('[WhatsApp Bridge] Init error:', err);
  });
  console.log(`[WhatsApp Bridge] Running on http://127.0.0.1:${PORT}`);
});
