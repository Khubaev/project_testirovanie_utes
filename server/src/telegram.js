import TelegramBot from 'node-telegram-bot-api';
import supabase from './db.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Метка поля → читаемое название
const FIELD_LABELS = {
  service_quality:    'Доп. услуги (аниматоры, SPA)',
  cost_rating:        'Стоимость услуг',
  cleaning_quality:   'Качество уборки',
  reception_quality:  'Зона ресепшен',
  food_quality:       'Питание',
  service_zone_quality: 'Сервис (шведка / ресторан / бар)',
};

// Поле оценки → поле комментария
const COMMENT_FIELDS = {
  service_quality:    'service_comment',
  cost_rating:        'cost_comment',
  cleaning_quality:   'cleaning_comment',
  reception_quality:  'reception_comment',
  food_quality:       'food_comment',
  service_zone_quality: 'service_zone_comment',
};

let bot = null;

export function initBot() {
  if (!TOKEN) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN не задан — бот отключён');
    return;
  }
  if (!CHAT_ID) {
    console.warn('[Telegram] TELEGRAM_CHAT_ID не задан — оповещения отключены');
  }

  bot = new TelegramBot(TOKEN, { polling: true });

  bot.on('polling_error', (err) => {
    console.error('[Telegram] polling error:', err.message);
  });

  bot.onText(/\/start|\/help/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      '<b>Бот уведомлений курорта</b>\n\n' +
        '/stats — статистика за всё время\n' +
        '/report — отчёт за последние 7 дней\n' +
        '/chatid — ID этого чата (для настройки .env)',
      { parse_mode: 'HTML' }
    );
  });

  bot.onText(/\/chatid/, (msg) => {
    bot.sendMessage(msg.chat.id, `ID этого чата: <code>${msg.chat.id}</code>`, {
      parse_mode: 'HTML',
    });
  });

  bot.onText(/\/stats/, async (msg) => {
    const text = await buildStatsMessage('all');
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
  });

  bot.onText(/\/report/, async (msg) => {
    const text = await buildStatsMessage('week');
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
  });

  scheduleWeeklyReport();
  console.log('[Telegram] Бот запущен (polling)');
}

/**
 * Отправить уведомление менеджеру если в анкете есть оценки ≤ 2.
 * @param {object} survey — объект ответа с полями оценок, комментариев и room_name
 */
export async function notifyLowRating(survey) {
  if (!bot || !CHAT_ID) return;

  const lowFields = Object.keys(FIELD_LABELS).filter(
    (f) => survey[f] != null && Number(survey[f]) <= 2
  );
  if (lowFields.length === 0) return;

  const room = survey.room_name ? `Номер: ${survey.room_name}` : 'Номер не указан';
  const date = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

  const lines = [`<b>Низкая оценка в анкете</b>`, `${room} · ${date}`, ''];

  for (const field of lowFields) {
    const score = survey[field];
    const label = FIELD_LABELS[field];
    const comment = survey[COMMENT_FIELDS[field]];
    lines.push(`${label}: <b>${score}/5</b>`);
    if (comment) lines.push(`   Комментарий: ${escapeHtml(comment)}`);
  }

  try {
    await bot.sendMessage(CHAT_ID, lines.join('\n'), { parse_mode: 'HTML' });
  } catch (err) {
    console.error('[Telegram] Ошибка отправки оповещения:', err.message);
  }
}

// --- Статистика ---

async function buildStatsMessage(period) {
  try {
    let query = supabase
      .from('survey_responses')
      .select(
        'service_quality, cost_rating, cleaning_quality, reception_quality, food_quality, service_zone_quality',
        { count: 'exact' }
      );

    if (period === 'week') {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', since);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const total = count || 0;
    const periodLabel = period === 'week' ? 'за последние 7 дней' : 'за всё время';

    if (total === 0) {
      return `<b>Статистика анкет ${periodLabel}</b>\n\nОтветов пока нет.`;
    }

    const sums = {};
    const counts = {};
    Object.keys(FIELD_LABELS).forEach((k) => {
      sums[k] = 0;
      counts[k] = 0;
    });

    data.forEach((row) => {
      Object.keys(FIELD_LABELS).forEach((k) => {
        if (row[k] != null) {
          sums[k] += Number(row[k]);
          counts[k]++;
        }
      });
    });

    const lines = [`<b>Статистика анкет ${periodLabel}</b>`, `Всего ответов: <b>${total}</b>`, ''];

    for (const [field, label] of Object.entries(FIELD_LABELS)) {
      if (counts[field] === 0) continue;
      const avg = sums[field] / counts[field];
      const bar = ratingBar(avg);
      lines.push(`${label}\n${bar} <b>${avg.toFixed(2)}/5</b>`);
    }

    return lines.join('\n');
  } catch (err) {
    console.error('[Telegram] Ошибка статистики:', err.message);
    return 'Ошибка получения статистики.';
  }
}

function ratingBar(avg) {
  const filled = Math.round(avg);
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

// --- Еженедельный отчёт ---

function scheduleWeeklyReport() {
  if (!CHAT_ID) return;

  // Следующий понедельник в 08:00 по МСК (UTC+3 → 05:00 UTC)
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(5, 0, 0, 0);
  const day = target.getUTCDay(); // 0=вс, 1=пн...
  const daysToMonday = day === 1 ? 7 : (8 - day) % 7;
  target.setUTCDate(target.getUTCDate() + daysToMonday);

  const msUntilFirst = target - now;

  setTimeout(async () => {
    await sendWeeklyReport();
    setInterval(sendWeeklyReport, 7 * 24 * 60 * 60 * 1000);
  }, msUntilFirst);

  console.log(`[Telegram] Еженедельный отчёт запланирован на ${target.toISOString()}`);
}

async function sendWeeklyReport() {
  if (!bot || !CHAT_ID) return;
  const text = await buildStatsMessage('week');
  try {
    await bot.sendMessage(CHAT_ID, text, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('[Telegram] Ошибка отправки недельного отчёта:', err.message);
  }
}

export function stopBot() {
  if (bot) {
    bot.stopPolling();
    bot = null;
  }
}

// --- Утилиты ---

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
