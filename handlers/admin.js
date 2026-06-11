import { getSupabase, updateUserSessions, getUser } from '../database/supabase.js';
import { notifyAdmin } from '../utils/helpers.js';
import { CONTACTS, PRICES } from '../utils/constants.js';

export function setupAdminHandlers(bot, ADMIN_ID) {
  
  // Команда /admin
  bot.command('admin', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
      await ctx.reply('❌ У вас нет доступа.');
      return;
    }
    
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
  
  // Обработчики кнопок админ-панели
  bot.action(/^admin_(.+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
      await ctx.answerCbQuery('Нет доступа');
      return;
    }
    
    const action = ctx.match[1];
    
    if (action === 'close') {
      await ctx.deleteMessage();
      await ctx.answerCbQuery('Меню закрыто');
      return;
    }
    
    if (action === 'today') {
      const today = new Date().toISOString().split('T')[0];
      const { data: bookings, error } = await getSupabase()
        .from('bookings')
        .select('*')
        .gte('datetime', `${today}T00:00:00`)
        .lte('datetime', `${today}T23:59:59`);
      
      if (error || !bookings?.length) {
        await ctx.reply('📭 На сегодня нет записей.');
      } else {
        let message = `📅 *Записи на ${today}:*\n\n`;
        bookings.forEach((b, i) => {
          const time = b.datetime.split('T')[1].substring(0, 5);
          message += `${i + 1}. ${b.trainer_name} — ${time}\n`;
        });
        await ctx.reply(message, { parse_mode: 'Markdown' });
      }
      await ctx.answerCbQuery();
      return;
    }
    
    if (action === 'users') {
      const { data: users, error } = await getSupabase()
        .from('users')
        .select('username, sessions_left')
        .order('username');
      
      if (error || !users?.length) {
        await ctx.reply('❌ Нет пользователей');
      } else {
        let message = '👥 *Список пользователей:*\n\n';
        users.forEach(u => {
          message += `@${u.username || 'без username'} — ${u.sessions_left} тренировок\n`;
        });
        await ctx.reply(message, { parse_mode: 'Markdown' });
      }
      await ctx.answerCbQuery();
      return;
    }
    
    if (action === 'stats') {
      const { count: usersCount } = await getSupabase()
        .from('users')
        .select('*', { count: 'exact', head: true });
      
      const { count: bookingsCount } = await getSupabase()
        .from('bookings')
        .select('*', { count: 'exact', head: true });
      
      const { data: totalSessions } = await getSupabase()
        .from('users')
        .select('sessions_left');
      
      const totalLeft = totalSessions?.reduce((sum, u) => sum + u.sessions_left, 0) || 0;
      
      await ctx.reply(
        `📊 *Статистика:*\n\n` +
        `👥 Пользователей: ${usersCount || 0}\n` +
        `📋 Всего записей: ${bookingsCount || 0}\n` +
        `💪 Осталось тренировок: ${totalLeft}`,
        { parse_mode: 'Markdown' }
      );
      await ctx.answerCbQuery();
      return;
    }
    
    if (action === 'add_sessions') {
      await ctx.reply(
        '➕ *Добавление тренировок*\n\n' +
        'Отправьте имя пользователя и количество в формате:\n\n' +
        '`@username 5`\n\n' +
        'Пример: `@annabeva 3`',
        { parse_mode: 'Markdown' }
      );
      ctx.session.waitingForAddSessions = true;
      await ctx.answerCbQuery();
      return;
    }
    
    await ctx.answerCbQuery('Неизвестная команда');
  });
  
  // Обработчик добавления тренировок (исправлен — не блокирует другие обработчики)
  bot.on('text', async (ctx) => {
    // Если не ждём ввод от админа — просто выходим, не блокируя другие обработчики
    if (!ctx.session?.waitingForAddSessions) {
      return;
    }
    
    delete ctx.session.waitingForAddSessions;
    
    const parts = ctx.message.text.split(' ');
    if (parts.length < 2) {
      await ctx.reply('❌ Формат: @username количество\n\nПример: @annabeva 5');
      return;
    }
    
    let username = parts[0];
    const sessionsToAdd = parseInt(parts[1]);
    
    if (username.startsWith('@')) {
      username = username.slice(1);
    }
    
    if (isNaN(sessionsToAdd) || sessionsToAdd <= 0) {
      await ctx.reply('❌ Количество должно быть положительным числом.');
      return;
    }
    
    const { data: user, error } = await getSupabase()
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (error || !user) {
      await ctx.reply(`❌ Пользователь @${username} не найден.`);
      return;
    }
    
    const newSessions = user.sessions_left + sessionsToAdd;
    await updateUserSessions(user.telegram_id, newSessions);
    
    await ctx.reply(`✅ @${username} +${sessionsToAdd} тренировок.\nТеперь осталось: ${newSessions}`);
    
    try {
      await ctx.telegram.sendMessage(user.telegram_id, `🎉 Администратор добавил вам ${sessionsToAdd} тренировок!\n💪 Теперь у вас ${newSessions} тренировок.`);
    } catch (err) {
      console.log('Не удалось уведомить пользователя');
    }
  });
}