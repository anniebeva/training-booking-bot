import { getUser, getUserBookings } from '../database/supabase.js';

export function setupStartHandler(bot, ADMIN_ID) {
  bot.start(async (ctx) => {
    const user = await getUser(ctx.from.id, ctx.from.username);
    let keyboard = [
      ['📅 Записаться'],
      ['❌ Отменить', '💪 Мой абонемент'],
      ['📋 Мои записи', '❓ Помощь']
    ];
    if (ctx.from.id === ADMIN_ID) {
      keyboard.push(['👑 Админ-панель']);
    }

    let message = `🏋️ Добро пожаловать!`;
    if (user.sessions_left === 1) {
      message += `\n🎁 У вас есть 1 тестовая тренировка в подарок!\n💪 Для покупки абонемента обратитесь к администратору.`;
    } else {
      message += `\n💪 Осталось: ${user.sessions_left} тренировок`;
    }
    message += `\n\nВыберите действие:`;

    await ctx.reply(message, {
      reply_markup: { keyboard, resize_keyboard: true }
    });
  });

  bot.hears('📅 Записаться', async (ctx) => {
    console.log('🔍 Кнопка "Записаться" нажата!');
    try {
      await ctx.scene.enter('booking-wizard');
      console.log('✅ Сцена booking-wizard запущена');
    } catch (error) {
      console.error('❌ Ошибка входа в сцену:', error);
      await ctx.reply('❌ Ошибка при открытии формы записи. Попробуйте позже.');
    }
  });

  bot.hears('❌ Отменить', async (ctx) => {
    console.log('🔍 Кнопка "Отменить" нажата!');
    try {
      await ctx.scene.enter('cancel-wizard');
      console.log('✅ Сцена cancel-wizard запущена');
    } catch (error) {
      console.error('❌ Ошибка входа в сцену отмены:', error);
      await ctx.reply('❌ Ошибка при открытии отмены. Попробуйте позже.');
    }
  });

  bot.command('my', async (ctx) => {
    const user = await getUser(ctx.from.id);
    await ctx.reply(`💪 Осталось тренировок: ${user.sessions_left}`);
  });

  bot.command('recordings', async (ctx) => {
    const bookings = await getUserBookings(ctx.from.id);
    if (!bookings || bookings.length === 0) {
      await ctx.reply('📭 У вас нет предстоящих записей.');
      return;
    }
    let message = '📋 Ваши предстоящие записи:\n\n';
    bookings.forEach((booking, index) => {
      const date = booking.datetime.split('T')[0];
      const time = booking.datetime.split('T')[1].substring(0, 5);
      message += `${index + 1}. ${booking.trainer_name} — ${date} в ${time}\n`;
    });
    await ctx.reply(message);
  });

  bot.hears('💪 Мой абонемент', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (user.sessions_left === 1) {
      await ctx.reply(`🎁 У вас 1 тестовая тренировка в подарок.\nДля покупки абонемента обратитесь к администратору.`);
    } else {
      await ctx.reply(`💪 Осталось тренировок: ${user.sessions_left}`);
    }
  });

  bot.hears('📋 Мои записи', async (ctx) => {
    const bookings = await getUserBookings(ctx.from.id);
    if (!bookings || bookings.length === 0) {
      await ctx.reply('📭 У вас нет предстоящих тренировок.\n\nЧтобы записаться, нажмите "📅 Записаться".');
      return;
    }
    let message = '📋 *Ваши предстоящие тренировки:*\n\n';
    bookings.forEach((booking, index) => {
      const date = booking.datetime.split('T')[0];
      const time = booking.datetime.split('T')[1].substring(0, 5);
      message += `${index + 1}. ${booking.trainer_name} — ${date} в ${time}\n`;
    });
    message += '\nЧтобы отменить запись, нажмите "❌ Отменить"';
    await ctx.reply(message, { parse_mode: 'Markdown' });
  });

  bot.hears('❓ Помощь', async (ctx) => {
    await ctx.reply(`❓ Помощь:\n/start — меню\n/my — остаток тренировок\n/recordings — мои записи\n\nОтмена бесплатно за 24+ часов. Позже — тренировка списывается.`);
  });

  bot.hears('👑 Админ-панель', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await ctx.reply(
      '👑 *Админ-панель*\n\nВыберите действие:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ Добавить тренировки', callback_data: 'admin_add_sessions' }],
            [{ text: '📅 Записи на сегодня', callback_data: 'admin_today' }],
            [{ text: '👥 Список пользователей', callback_data: 'admin_users' }],
            [{ text: '📊 Статистика', callback_data: 'admin_stats' }],
            [{ text: '❌ Закрыть', callback_data: 'admin_close' }]
          ]
        }
      }
    );
  });
}