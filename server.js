// ============ البوت + البانل ============
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============ بيانات السيرفر بتاعك ============
// عدّل القيم دي بس عشان البوت يشتغل تلقائي مع تشغيل السيرفر
const DEFAULT_CONFIG = {
  host: 'your-server-ip-or-domain.com',  // ← غيّر ده
  port: 25565,                            // ← غيّر ده لو المنفذ مختلف
  username: '2ar2oosh',                   // ← اسم البوت
  version: false                          // ← سيبه false أو اكتب مثلاً '1.20.1'
};

// ============ المتغيرات ============
let bot = null;
let moveTimer = null;
let logs = [];
let state = {
  connected: false,
  username: null,
  server: null
};

// ============ تسجيل اللوجات ============
function log(msg) {
  const entry = `[${new Date().toLocaleTimeString('ar-EG')}] ${msg}`;
  logs.push(entry);
  if (logs.length > 200) logs.shift();
  io.emit('log', entry);
  console.log(entry);
}

// ============ الحركة العشوائية ============
function scheduleMove() {
  const delay = 2000 + Math.random() * 4000; // بين 2 و 6 ثواني
  moveTimer = setTimeout(() => {
    if (!bot || !state.connected) return;

    try {
      // لف الرأس بشكل عشوائي
      bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * 1, true);
    } catch (e) {}

    // اختار اتجاه عشوائي
    const dirs = ['forward', 'back', 'left', 'right'];
    const dir = dirs[Math.floor(Math.random() * dirs.length)];

    try { bot.setControlState(dir, true); } catch (e) {}

    // سيب الزر مضغوط لمدة عشوائية
    const hold = 400 + Math.random() * 900;
    setTimeout(() => {
      try { bot.setControlState(dir, false); } catch (e) {}
    }, hold);

    // قفزة عشوائية
    if (Math.random() < 0.4) {
      try {
        bot.setControlState('jump', true);
        setTimeout(() => {
          try { bot.setControlState('jump', false); } catch (e) {}
        }, 300);
      } catch (e) {}
    }

    scheduleMove();
  }, delay);
}

function stopMovement() {
  if (moveTimer) clearTimeout(moveTimer);
  moveTimer = null;
  if (bot) {
    ['forward', 'back', 'left', 'right', 'jump', 'sneak'].forEach(a => {
      try { bot.setControlState(a, false); } catch (e) {}
    });
  }
}

// ============ تشغيل البوت ============
function startBot(cfg) {
  if (bot) return { ok: false, msg: 'فيه بوت شغال بالفعل' };
  if (!cfg.host || !cfg.username) return { ok: false, msg: 'البيانات ناقصة' };

  try {
    bot = mineflayer.createBot({
      host: cfg.host.trim(),
      port: parseInt(cfg.port) || 25565,
      username: cfg.username.trim(),
      version: cfg.version && String(cfg.version).trim() !== '' ? String(cfg.version).trim() : false,
      auth: 'offline',
      // تحسينات للأداء على الرام القليلة
      viewDistance: 'tiny',
      chatLengthLimit: 100
    });
  } catch (e) {
    bot = null;
    return { ok: false, msg: e.message };
  }

  state.server = `${cfg.host}:${cfg.port || 25565}`;
  state.username = cfg.username;
  io.emit('state', state);

  bot.on('login', () => {
    state.connected = true;
    log(`✅ دخل السيرفر باسم ${bot.username}`);
    io.emit('state', state);
    scheduleMove();
  });

  bot.on('spawn', () => log('🌍 البوت ظهر في العالم'));

  bot.on('chat', (u, msg) => {
    if (u === bot.username) return;
    log(`<${u}> ${msg}`);
  });

  bot.on('kicked', (r) => log('⚠️ اتطرد: ' + (typeof r === 'string' ? r : JSON.stringify(r))));
  bot.on('error', (e) => log('❌ خطأ: ' + e.message));

  bot.on('end', (reason) => {
    log('🔌 الاتصال انتهى: ' + reason);
    state.connected = false;
    stopMovement();
    bot = null;
    io.emit('state', state);
  });

  return { ok: true, msg: 'جاري التشغيل...' };
}

function stopBot() {
  if (!bot) return { ok: false, msg: 'مفيش بوت شغال' };
  stopMovement();
  try { bot.quit('stopped'); } catch (e) {}
  bot = null;
  state.connected = false;
  io.emit('state', state);
  return { ok: true };
}

// ============ Routes ============
app.post('/api/start', (req, res) => res.json(startBot(req.body)));
app.post('/api/stop', (req, res) => res.json(stopBot()));
app.get('/api/state', (req, res) => res.json(state));
app.post('/api/chat', (req, res) => {
  if (!bot) return res.json({ ok: false, msg: 'مفيش بوت' });
  try { bot.chat(String(req.body.message || '')); res.json({ ok: true }); }
  catch (e) { res.json({ ok: false, msg: e.message }); }
});

// ============ Socket.IO ============
io.on('connection', (socket) => {
  socket.emit('state', state);
  logs.forEach(l => socket.emit('log', l));
});

// ============ تشغيل السيرفر ============
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Panel running on port ${PORT}`);
  // تشغيل البوت تلقائي مع السيرفر
  if (DEFAULT_CONFIG.host !== 'your-server-ip-or-domain.com') {
    log('🚀 تشغيل البوت تلقائي...');
    startBot(DEFAULT_CONFIG);
  } else {
    log('⚠️ عدّل DEFAULT_CONFIG في server.js عشان البوت يشتغل تلقائي');
  }
});