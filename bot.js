/**
 * BarBot — Telegram-бот для записи в барбершоп
 * Версия с улучшенным интерфейсом и управлением записями
 * Использует socks-proxy-agent глобально для всех запросов
 */

// ===== УСТАНОВКА ГЛОБАЛЬНОГО ПРОКСИ =====
const { SocksProxyAgent } = require('socks-proxy-agent');
const http = require('http');
const https = require('https');

const proxyAgent = new SocksProxyAgent('socks5://127.0.0.1:10808');
http.globalAgent = proxyAgent;
https.globalAgent = proxyAgent;

console.log('[PROXY] Глобальный SOCKS5 прокси установлен: 127.0.0.1:10808');

require('dotenv').config();
const { TelegramBot } = require('node-telegram-bot-api');
const sheets = require('./sheets');
const fs = require('fs');
const path = require('path');

// ===== Конфиг =====
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);
const SALON = {
  name: process.env.SALON_NAME || 'Барбершоп',
  address: process.env.SALON_ADDRESS || 'ул. Тверская, 15',
  phone: process.env.SALON_PHONE || '+7-910-565-03-40'
};
const MASTERS = (process.env.MASTERS || 'Алексей,Дмитрий,Михаил').split(',').map(s => s.trim());
const SERVICES = (process.env.SERVICES || 'Мужская стрижка:1500:45,Бритьё:1200:30').split(',').map(s => {
  const [name, price, duration] = s.split(':');
  return { name: name.trim(), price: parseInt(price, 10), duration: parseInt(duration, 10) };
});
const WORK_START = parseInt(process.env.WORK_HOURS_START, 10) || 10;
const WORK_END = parseInt(process.env.WORK_HOURS_END, 10) || 20;

if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не указан в .env!');
  process.exit(1);
}

// ===== Инициализация бота (прокси уже глобальный) =====
const bot = new TelegramBot(TOKEN, { polling: true });

// ===== Хранилище данных =====
const userState = {};
let bookings = [];

const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');
function loadBookings() {
  try {
    if (fs.existsSync(BOOKINGS_FILE)) {
      bookings = JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf-8'));
    }
  } catch (e) { bookings = []; }
}
function saveBookings() {
  try {
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
  } catch (e) {}
}
loadBookings();

console.log('');
console.log('╔════════════════════════════════════════╗');
console.log('║   💈  BarBot v4 (глобальный прокси) 💈 ║');
console.log('╚════════════════════════════════════════╝');
console.log(`  💈 Салон:    ${SALON.name}`);
console.log(`  👨 Мастера:  ${MASTERS.join(', ')}`);
console.log(`  ✂️ Услуги:   ${SERVICES.length} шт.`);
console.log('');

// Подключаем Google Sheets
sheets.init();

// ===== Вспомогательные функции =====

function getUserBookings(chatId) {
  return bookings.filter(b => b.chatId === chatId && b.status !== 'cancelled');
}

function getBookingById(id) {
  return bookings.find(b => b.id === id);
}

function updateBooking(id, newData) {
  const idx = bookings.findIndex(b => b.id === id);
  if (idx === -1) return false;
  bookings[idx] = { ...bookings[idx], ...newData };
  saveBookings();
  return true;
}

function cancelBooking(id) {
  const b = getBookingById(id);
  if (!b) return false;
  b.status = 'cancelled';
  saveBookings();
  return true;
}

// ===== Главное меню =====
function getMainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✂️ Записаться', callback_data: 'book' }],
        [{ text: '📅 Мои записи', callback_data: 'my' }],
        [{ text: '💰 Цены', callback_data: 'prices' }, { text: '📍 Адрес', callback_data: 'address' }]
      ]
    }
  };
}

// ===== Команды =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  delete userState[chatId];
  const name = msg.from.first_name || 'друг';
  bot.sendMessage(chatId,
    `👋 Привет, <b>${name}</b>!\n\nЯ — бот записи в <b>${SALON.name}</b>.\nВыбери действие:`,
    { parse_mode: 'HTML', ...getMainMenu() }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📋 <b>Как пользоваться:</b>\n\n` +
    `• Нажми «✂️ Записаться» — выбери услугу, мастера, дату и время.\n` +
    `• «📅 Мои записи» — посмотреть, изменить или отменить запись.\n` +
    `• «💰 Цены» — прайс-лист.\n` +
    `• «📍 Адрес» — контакты салона.\n\n` +
    `Если что-то не так — напиши /start для перезапуска.`,
    { parse_mode: 'HTML', ...getMainMenu() }
  );
});

// ===== Обработка callback-запросов =====
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const msgId = query.message.message_id;

  // ---- Главное меню ----
  if (data === 'book') {
    userState[chatId] = { step: 'choose_service' };
    await showServices(chatId);
    return bot.answerCallbackQuery(query.id);
  }
  if (data === 'my') {
    await showMyBookings(chatId);
    return bot.answerCallbackQuery(query.id);
  }
  if (data === 'prices') {
    await showPrices(chatId);
    return bot.answerCallbackQuery(query.id);
  }
  if (data === 'address') {
    await bot.sendMessage(chatId,
      `📍 <b>${SALON.name}</b>\n\nАдрес: ${SALON.address}\nТелефон: ${SALON.phone}\n\n🕐 Работаем: ${WORK_START}:00 — ${WORK_END}:00`,
      { parse_mode: 'HTML', ...getMainMenu() }
    );
    return bot.answerCallbackQuery(query.id);
  }

  // ---- Выбор услуги ----
  if (data.startsWith('service_')) {
    const serviceName = data.replace('service_', '');
    const service = SERVICES.find(s => s.name === serviceName);
    if (!service) {
      await bot.answerCallbackQuery(query.id, { text: '❌ Услуга не найдена' });
      return;
    }
    userState[chatId] = { ...userState[chatId], service };
    userState[chatId].step = 'choose_master';
    await showMasters(chatId, service);
    return bot.answerCallbackQuery(query.id);
  }

  // ---- Выбор мастера ----
  if (data.startsWith('master_')) {
    const master = data.replace('master_', '');
    userState[chatId] = { ...userState[chatId], master };
    userState[chatId].step = 'choose_date';
    await showDates(chatId);
    return bot.answerCallbackQuery(query.id);
  }

  // ---- Выбор даты ----
  if (data.startsWith('date_')) {
    const dateStr = data.replace('date_', '');
    userState[chatId] = { ...userState[chatId], date: dateStr };
    userState[chatId].step = 'choose_time';
    await showTimes(chatId);
    return bot.answerCallbackQuery(query.id);
  }

  // ---- Выбор времени ----
  if (data.startsWith('time_')) {
    const time = data.replace('time_', '');
    userState[chatId] = { ...userState[chatId], time };
    userState[chatId].step = 'enter_name';
    await bot.sendMessage(chatId, '📝 Напишите ваше имя:', {
      reply_markup: { force_reply: true }
    });
    return bot.answerCallbackQuery(query.id);
  }

  // ---- Изменение записи ----
  if (data.startsWith('change_')) {
    const bookingId = data.replace('change_', '');
    userState[chatId] = { step: 'change_date', bookingId };
    await showDates(chatId, true);
    return bot.answerCallbackQuery(query.id);
  }

  if (data.startsWith('change_date_')) {
    const parts = data.split('_');
    const bookingId = parts[1];
    const newDate = parts.slice(2).join('_');
    const booking = getBookingById(bookingId);
    if (!booking) {
      await bot.sendMessage(chatId, '❌ Запись не найдена', getMainMenu());
      return bot.answerCallbackQuery(query.id);
    }
    userState[chatId] = { step: 'change_time', bookingId, newDate };
    await showTimes(chatId, true);
    return bot.answerCallbackQuery(query.id);
  }

  if (data.startsWith('change_time_')) {
    const parts = data.split('_');
    const bookingId = parts[1];
    const newTime = parts.slice(2).join('_');
    const booking = getBookingById(bookingId);
    if (!booking) {
      await bot.sendMessage(chatId, '❌ Запись не найдена', getMainMenu());
      return bot.answerCallbackQuery(query.id);
    }
    const state = userState[chatId] || {};
    const newDate = state.newDate || booking.date;
    const updated = updateBooking(bookingId, { date: newDate, time: newTime });
    if (updated) {
      sheets.addLead({
        id: booking.id + '_changed',
        name: booking.name,
        phone: booking.phone,
        telegram: booking.telegram || '',
        source: 'telegram_bot_change',
        service: booking.service.name,
        master: booking.master,
        date: newDate,
        time: newTime,
        timestamp: new Date().toISOString()
      }).catch(() => {});
      await bot.sendMessage(chatId,
        `✅ Запись изменена!\n\n✂️ ${booking.service.name}\n👨 ${booking.master}\n📅 ${newDate} в ${newTime}`,
        getMainMenu()
      );
    } else {
      await bot.sendMessage(chatId, '❌ Не удалось изменить запись', getMainMenu());
    }
    delete userState[chatId];
    return bot.answerCallbackQuery(query.id);
  }

  // ---- Отмена записи ----
  if (data.startsWith('cancel_')) {
    const bookingId = data.replace('cancel_', '');
    const booking = getBookingById(bookingId);
    if (!booking) {
      await bot.sendMessage(chatId, '❌ Запись не найдена', getMainMenu());
      return bot.answerCallbackQuery(query.id);
    }
    const ok = cancelBooking(bookingId);
    if (ok) {
      await bot.sendMessage(chatId,
        `❌ Запись отменена:\n✂️ ${booking.service.name}\n📅 ${booking.date} в ${booking.time}`,
        getMainMenu()
      );
      if (ADMIN_ID) {
        bot.sendMessage(ADMIN_ID, `❌ Клиент ${booking.name} отменил запись на ${booking.date} ${booking.time}`);
      }
    } else {
      await bot.sendMessage(chatId, '❌ Не удалось отменить запись', getMainMenu());
    }
    delete userState[chatId];
    return bot.answerCallbackQuery(query.id);
  }

  // ---- Подтверждение записи ----
  if (data === 'confirm_booking') {
    const state = userState[chatId];
    if (!state || !state.service) {
      await bot.answerCallbackQuery(query.id, { text: 'Ошибка: начните заново' });
      return;
    }

    const booking = {
      id: Date.now().toString(36) + '_' + chatId,
      chatId,
      name: state.name || 'Не указано',
      phone: state.phone || 'Не указан',
      telegram: '@' + (query.from.username || query.from.first_name || ''),
      service: state.service,
      master: state.master,
      date: state.date,
      time: state.time,
      createdAt: new Date().toISOString(),
      status: 'active'
    };
    bookings.push(booking);
    saveBookings();

    sheets.addLead({
      id: booking.id,
      name: booking.name,
      phone: booking.phone,
      telegram: booking.telegram,
      source: 'telegram_bot',
      service: booking.service.name,
      master: booking.master,
      date: booking.date,
      time: booking.time,
      timestamp: booking.createdAt
    }).catch(err => console.error('[SHEETS] error:', err));

    if (ADMIN_ID) {
      try {
        await bot.sendMessage(ADMIN_ID,
          `🆕 <b>Новая запись из бота!</b>\n\n` +
          `👤 ${booking.name}\n📱 ${booking.phone}\n💬 ${booking.telegram}\n` +
          `✂️ ${booking.service.name} (${booking.service.duration} мин, ${booking.service.price} ₽)\n` +
          `👨 Мастер: ${booking.master}\n📅 ${booking.date} в ${booking.time}`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {}
    }

    await bot.editMessageText(
      `✅ <b>Запись подтверждена!</b>\n\n` +
      `✂️ ${booking.service.name}\n💰 ${booking.service.price} ₽\n` +
      `👨 Мастер: ${booking.master}\n📅 ${booking.date} в ${booking.time}\n` +
      `👤 ${booking.name}\n📱 ${booking.phone}\n\n` +
      `📍 ${SALON.address}\n\n` +
      `🔔 Напомним за 2 часа до визита.`,
      { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }
    );
    await bot.answerCallbackQuery(query.id, { text: '✅ Записано!' });
    delete userState[chatId];
    return;
  }

  if (data === 'cancel_booking') {
    await bot.editMessageText('❌ Запись отменена.', { chat_id: chatId, message_id: msgId });
    delete userState[chatId];
    await bot.answerCallbackQuery(query.id, { text: 'Отменено' });
  }
});

// ===== Обработка входящих сообщений =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const contact = msg.contact;

  if (contact && userState[chatId] && userState[chatId].step === 'enter_phone') {
    console.log('[DEBUG] Получен контакт:', contact.phone_number);
    const state = userState[chatId];
    let phone = contact.phone_number.replace(/\D/g, '');
    if (phone.startsWith('8')) phone = '7' + phone.slice(1);
    if (!phone.startsWith('7')) phone = '7' + phone;
    state.phone = '+' + phone;
    state.step = 'confirm';
    try {
      await showConfirmation(chatId, state);
      console.log('[DEBUG] Подтверждение отправлено');
    } catch (err) {
      console.error('[DEBUG] Ошибка showConfirmation:', err);
      await bot.sendMessage(chatId, '❌ Что-то пошло не так. Попробуйте /start заново.');
    }
    return;
  }

  if (!text) return;
  const state = userState[chatId];
  if (!state) return;

  if (state.step === 'enter_name') {
    if (text.length < 2) {
      await bot.sendMessage(chatId, '❌ Имя слишком короткое. Попробуйте ещё раз:');
      return;
    }
    state.name = text;
    state.step = 'enter_phone';
    await bot.sendMessage(chatId, '📱 Отправьте номер телефона (нажмите кнопку ниже):', {
      reply_markup: {
        keyboard: [[{ text: '📱 Отправить номер', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
    return;
  }

  if (state.step === 'enter_phone' && text) {
    const phoneDigits = text.replace(/\D/g, '');
    if (phoneDigits.length >= 10) {
      let phone = phoneDigits;
      if (phone.startsWith('8')) phone = '7' + phone.slice(1);
      if (!phone.startsWith('7')) phone = '7' + phone;
      state.phone = '+' + phone;
      state.step = 'confirm';
      try {
        await showConfirmation(chatId, state);
      } catch (err) {
        console.error(err);
        await bot.sendMessage(chatId, '❌ Ошибка, попробуйте ещё раз.');
      }
    } else {
      await bot.sendMessage(chatId, '❌ Некорректный номер. Попробуйте ещё раз или нажмите кнопку.');
    }
  }
});

// ===== Функции отображения =====

async function showServices(chatId) {
  const keyboard = SERVICES.map(s => [{
    text: `${s.name} · ${s.price} ₽ · ${s.duration} мин`,
    callback_data: `service_${s.name}`
  }]);
  keyboard.push([{ text: '❌ Отменить', callback_data: 'cancel_booking' }]);

  await bot.sendMessage(chatId,
    '✂️ <b>Выберите услугу:</b>',
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }
  );
}

async function showMasters(chatId, service) {
  const keyboard = MASTERS.map(m => [{
    text: `👤 ${m}`,
    callback_data: `master_${m}`
  }]);
  keyboard.unshift([{ text: '👤 Любой мастер', callback_data: 'master_Любой' }]);
  keyboard.push([{ text: '❌ Отменить', callback_data: 'cancel_booking' }]);

  await bot.sendMessage(chatId,
    `✂️ ${service.name} (${service.duration} мин · ${service.price} ₽)\n\n👨 <b>Выберите мастера:</b>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }
  );
}

async function showDates(chatId, changeMode = false) {
  const keyboard = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const weekday = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()];
    const label = `${day}.${month} (${weekday})`;
    const dateStr = `${day}.${month}.${d.getFullYear()}`;
    let callback;
    if (changeMode) {
      const bookingId = userState[chatId]?.bookingId || '';
      callback = `change_date_${bookingId}_${dateStr}`;
    } else {
      callback = `date_${dateStr}`;
    }
    keyboard.push([{ text: label, callback_data: callback }]);
  }
  keyboard.push([{ text: '❌ Отменить', callback_data: 'cancel_booking' }]);

  await bot.sendMessage(chatId,
    `📅 <b>Выберите дату:</b>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }
  );
}

async function showTimes(chatId, changeMode = false) {
  const keyboard = [];
  for (let h = WORK_START; h < WORK_END; h++) {
    const time = `${String(h).padStart(2, '0')}:00`;
    let callback;
    if (changeMode) {
      const bookingId = userState[chatId]?.bookingId || '';
      callback = `change_time_${bookingId}_${time}`;
    } else {
      callback = `time_${time}`;
    }
    keyboard.push([{ text: time, callback_data: callback }]);
  }
  keyboard.push([{ text: '❌ Отменить', callback_data: 'cancel_booking' }]);

  const state = userState[chatId];
  let msg = `⏰ <b>Выберите время:</b>`;
  if (state && state.service) {
    msg += `\n\n<i>${state.date || ''} · ${state.service.name} · ${state.master || ''}</i>`;
  }

  await bot.sendMessage(chatId, msg,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }
  );
}

async function showConfirmation(chatId, state) {
  const text =
    `📋 <b>Проверьте запись:</b>\n\n` +
    `✂️ ${state.service.name} (${state.service.duration} мин)\n` +
    `💰 ${state.service.price} ₽\n` +
    `👨 Мастер: ${state.master}\n` +
    `📅 ${state.date} в ${state.time}\n` +
    `👤 ${state.name}\n` +
    `📱 ${state.phone}\n\n` +
    `Всё верно?`;

  await bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Подтвердить', callback_data: 'confirm_booking' }],
        [{ text: '❌ Отменить', callback_data: 'cancel_booking' }]
      ]
    }
  });
}

async function showMyBookings(chatId) {
  const myBookings = getUserBookings(chatId);
  if (myBookings.length === 0) {
    await bot.sendMessage(chatId,
      `📅 У вас пока нет записей.\n\nНажмите «✂️ Записаться», чтобы создать первую!`,
      getMainMenu()
    );
    return;
  }

  let text = `📅 <b>Ваши активные записи:</b>\n\n`;
  const keyboard = [];
  myBookings.forEach((b, i) => {
    text += `${i+1}. ${b.date} в ${b.time} — ${b.service.name}\n`;
    keyboard.push([
      { text: `✏️ Изменить ${i+1}`, callback_data: `change_${b.id}` },
      { text: `❌ Отменить ${i+1}`, callback_data: `cancel_${b.id}` }
    ]);
  });

  keyboard.push([{ text: '◀️ Назад', callback_data: 'book' }]);

  await bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function showPrices(chatId) {
  let text = `💰 <b>Прайс-лист:</b>\n\n`;
  SERVICES.forEach(s => {
    text += `✂️ ${s.name} — <b>${s.price} ₽</b> (${s.duration} мин)\n`;
  });
  text += `\n📍 ${SALON.address}\n📞 ${SALON.phone}`;
  await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...getMainMenu() });
}

// ===== Обработка ошибок =====
bot.on('polling_error', (err) => {
  console.error('[POLLING ERROR]', err.message);
});

console.log('✅ Бот готов принимать сообщения!');
console.log(`📱 Откройте бота: https://t.me/barber62rznbot`);