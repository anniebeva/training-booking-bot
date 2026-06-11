import { Telegraf, Scenes, session } from 'telegraf';
import dotenv from 'dotenv';
import { initSupabase } from './database/supabase.js';
import { initAI } from './handlers/ai.js';
import { bookingWizard } from './handlers/booking.js';
import { cancelWizard } from './handlers/cancel.js';
import { setupStartHandler } from './handlers/start.js';
import { setupUnknownHandler } from './handlers/unknown.js';
import { setupAdminHandlers } from './handlers/admin.js';
import { setBotInstance } from './utils/helpers.js';

dotenv.config();

// Инициализация
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

// Сохраняем экземпляр бота для уведомлений
setBotInstance(bot);

// Инициализация Supabase
initSupabase(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Инициализация AI (OpenRouter)
if (process.env.OPENROUTER_API_KEY) {
  initAI(process.env.OPENROUTER_API_KEY);
  console.log('✅ AI инициализирован (OpenRouter)');
} else {
  console.log('⚠️ AI не настроен (нет OPENROUTER_API_KEY)');
}

// Регистрация сцен
const stage = new Scenes.Stage([bookingWizard, cancelWizard]);
bot.use(session());
bot.use(stage.middleware());

// Настройка обработчиков
setupStartHandler(bot, ADMIN_ID);
setupUnknownHandler(bot);
setupAdminHandlers(bot, ADMIN_ID);

// Запуск
bot.launch().then(() => {
  console.log('✅ Бот запущен!');
  console.log(`👤 Admin ID: ${ADMIN_ID}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));