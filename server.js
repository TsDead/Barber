/**
 * BarBot — Backend
 * Принимает заявки с лендинга и отправляет в Google Таблицу
 * Использует глобальный SOCKS5 прокси
 */

// ===== УСТАНОВКА ГЛОБАЛЬНОГО ПРОКСИ =====
const { SocksProxyAgent } = require('socks-proxy-agent');
const http = require('http');
const https = require('https');

const proxyAgent = new SocksProxyAgent('socks5://127.0.0.1:10808');
http.globalAgent = proxyAgent;
https.globalAgent = proxyAgent;

console.log('[PROXY] Глобальный SOCKS5 прокси установлен: 127.0.0.1:10808');

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const sheets = require('./sheets');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(__dirname));

app.use((req, res, next) => {
  const time = new Date().toISOString();
  console.log(`[${time}] ${req.method} ${req.url}`);
  next();
});

const CONFIG = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_ADMIN_ID: process.env.TELEGRAM_ADMIN_ID || '',
  LEADS_FILE: path.join(__dirname, 'leads.json'),
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || crypto.randomBytes(16).toString('hex')
};

async function loadLeads() {
  try {
    const data = await fs.readFile(CONFIG.LEADS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

async function saveLeads(leads) {
  await fs.writeFile(CONFIG.LEADS_FILE, JSON.stringify(leads, null, 2), 'utf-8');
}

async function sendToTelegram(lead) {
  if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_ADMIN_ID) {
    console.log('[TELEGRAM] Не настроен — пропускаем');
    return false;
  }

  const text =
    '🆕 *Новая заявка с сайта!*\n\n' +
    `👤 *Имя:* ${lead.name}\n` +
    `📞 *Телефон:* ${lead.phone}\n` +
    (lead.telegram ? `💬 *Telegram:* ${lead.telegram}\n` : '') +
    (lead.service ? `✂️ *Услуга:* ${lead.service}\n` : '') +
    (lead.master ? `👨 *Мастер:* ${lead.master}\n` : '') +
    (lead.date ? `📅 *Дата:* ${lead.date} ${lead.time || ''}\n` : '') +
    `🌐 *Источник:* ${lead.source || 'site'}\n` +
    `🕒 *Время:* ${new Date(lead.timestamp).toLocaleString('ru-RU')}\n` +
    `🔖 *ID:* \`${lead.id}\``;

  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CONFIG.TELEGRAM_ADMIN_ID,
        text,
        parse_mode: 'Markdown'
      })
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('[TELEGRAM] API error:', data);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[TELEGRAM] Send error:', err);
    return false;
  }
}

function validateLead(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    errors.push('Некорректные данные');
    return errors;
  }
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
    errors.push('Имя должно быть не короче 2 символов');
  }
  if (data.name && data.name.length > 100) {
    errors.push('Имя слишком длинное');
  }
  const phoneDigits = String(data.phone || '').replace(/\D/g, '');
  if (phoneDigits.length < 11) {
    errors.push('Некорректный телефон');
  }
  return errors;
}

const rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const last = rateLimitMap.get(ip) || 0;
  if (now - last < 30_000) {
    return false;
  }
  rateLimitMap.set(ip, now);
  if (rateLimitMap.size > 1000) {
    const cutoff = now - 60_000;
    for (const [key, time] of rateLimitMap.entries()) {
      if (time < cutoff) rateLimitMap.delete(key);
    }
  }
  return true;
}

app.post('/api/lead', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      ok: false,
      error: 'Слишком частые запросы. Подождите 30 секунд.'
    });
  }

  const errors = validateLead(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ ok: false, errors });
  }

  const lead = {
    id: crypto.randomBytes(6).toString('hex'),
    name: req.body.name.trim(),
    phone: req.body.phone.trim(),
    telegram: (req.body.telegram || '').trim(),
    source: req.body.source || 'site',
    ip,
    userAgent: req.headers['user-agent'] || '',
    timestamp: new Date().toISOString()
  };

  try {
    const leads = await loadLeads();
    leads.push(lead);
    await saveLeads(leads);

    sheets.addLead(lead).catch(err =>
      console.error('[SHEETS] async error:', err)
    );

    sendToTelegram(lead).catch(err =>
      console.error('[TELEGRAM] async error:', err)
    );

    console.log(`[LEAD] ✓ ${lead.name} (${lead.phone}) ID:${lead.id}`);
    return res.json({ ok: true, id: lead.id });
  } catch (err) {
    console.error('[LEAD] save error:', err);
    return res.status(500).json({ ok: false, error: 'Ошибка сохранения' });
  }
});

app.get('/api/leads', async (req, res) => {
  const token = req.query.token || req.headers['x-admin-token'];
  if (token !== CONFIG.ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  try {
    const leads = await loadLeads();
    return res.json({ ok: true, count: leads.length, leads });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Read error' });
  }
});

app.get('/api/leads.csv', async (req, res) => {
  const token = req.query.token || req.headers['x-admin-token'];
  if (token !== CONFIG.ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  try {
    const leads = await loadLeads();
    const header = 'id,name,phone,telegram,source,timestamp\n';
    const rows = leads.map(l =>
      [l.id, l.name, l.phone, l.telegram || '', l.source, l.timestamp]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    return res.send('\ufeff' + header + rows);
  } catch (err) {
    return res.status(500).send('Read error');
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    telegram: !!CONFIG.TELEGRAM_BOT_TOKEN,
    sheets: !!process.env.GOOGLE_SPREADSHEET_ID
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

sheets.init().then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log('║   💈  BarBot Backend v3 (proxy) 💈   ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`  🌐 Сайт:      http://localhost:${PORT}`);
    console.log(`  📡 API:        http://localhost:${PORT}/api/lead`);
    console.log(`  📊 Лиды:       http://localhost:${PORT}/api/leads?token=${CONFIG.ADMIN_TOKEN}`);
    console.log(`  💚 Health:     http://localhost:${PORT}/api/health`);
    console.log(`  📨 Telegram:   ${CONFIG.TELEGRAM_BOT_TOKEN ? '✓ настроен' : '✗ не настроен'}`);
    console.log(`  📊 Google:     ${process.env.GOOGLE_SPREADSHEET_ID ? '✓ настроен' : '✗ не настроен'}`);
    console.log('');
  });
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  process.exit(0);
});