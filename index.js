import { Telegraf, Scenes, session } from 'telegraf';
import express from 'express';
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

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

setBotInstance(bot);

initSupabase(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

if (process.env.OPENROUTER_API_KEY) {
  initAI(process.env.OPENROUTER_API_KEY, process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  console.log('✅ AI инициализирован (OpenRouter)');
}

const stage = new Scenes.Stage([bookingWizard, cancelWizard]);
bot.use(session());
bot.use(stage.middleware());

setupStartHandler(bot, ADMIN_ID);
setupAdminHandlers(bot, ADMIN_ID);
setupUnknownHandler(bot);

// ========== ВЫБОР РЕЖИМА ==========
const isProduction = process.env.NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL;

(async () => {
  if (isProduction) {
    // Webhook (для Render)
    const app = express();
    app.use(express.json());

    app.post('/webhook', async (req, res) => {
      try {
        await bot.handleUpdate(req.body);
        res.sendStatus(200);
      } catch (error) {
        console.error('❌ Webhook error:', error);
        res.sendStatus(500);
      }
    });

    app.get('/', (req, res) => {
      res.send('Bot is running');
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', async () => {
      console.log(`✅ Webhook server running on port ${PORT}`);
      const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/webhook`;
      try {
        await bot.telegram.setWebhook(webhookUrl);
        console.log(`✅ Webhook set to ${webhookUrl}`);
      } catch (error) {
        console.error('❌ Failed to set webhook:', error);
      }
    });
  } else {
    // Long polling (локально)
    await bot.telegram.deleteWebhook(); // убираем старый вебхук
    bot.launch().then(() => {
      console.log('✅ Бот запущен в режиме long polling!');
      console.log(`👤 Admin ID: ${ADMIN_ID}`);
    });
  }
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));