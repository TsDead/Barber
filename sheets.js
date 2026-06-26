/**
 * Модуль для работы с Google Sheets
 * Сохраняет все заявки в таблицу
 * Прокси настраивается через global-agent
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

let auth = null;
let sheets = null;
let enabled = false;

async function init() {
  if (!SPREADSHEET_ID) {
    console.log('[SHEETS] ⚠️  GOOGLE_SPREADSHEET_ID не указан в .env');
    return false;
  }
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.log('[SHEETS] ⚠️  credentials.json не найден в папке проекта');
    return false;
  }
  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    sheets = google.sheets({ version: 'v4', auth });
    enabled = true;
    console.log('[SHEETS] ✓ Подключено к Google Таблице');
    return true;
  } catch (err) {
    console.error('[SHEETS] Ошибка инициализации:', err.message);
    return false;
  }
}

async function addLead(lead) {
  if (!enabled) {
    console.log('[SHEETS] Пропускаем (не настроено)');
    return false;
  }

  const row = [
    lead.id || Date.now().toString(36),
    lead.timestamp
      ? new Date(lead.timestamp).toLocaleString('ru-RU')
      : new Date().toLocaleString('ru-RU'),
    lead.name || '',
    lead.phone || '',
    lead.telegram || '',
    lead.source || 'site',
    lead.service || '',
    lead.master || '',
    (lead.date && lead.time) ? `${lead.date} ${lead.time}` : ''
  ];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A1:I1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [row]
      }
    });
    console.log(`[SHEETS] ✓ Заявка добавлена: ${lead.name}`);
    return true;
  } catch (err) {
    console.error('[SHEETS] Ошибка записи:', err.message);
    if (err.message.includes('Premature close') || err.message.includes('ECONNRESET') || err.message.includes('fetch')) {
      console.error('[SHEETS] 💡 Проверьте, что Happ включён и прокси работает на 127.0.0.1:10808');
      console.error('[SHEETS] 💡 Также убедитесь, что global-agent установлен: npm install global-agent');
    }
    return false;
  }
}

module.exports = { init, addLead };