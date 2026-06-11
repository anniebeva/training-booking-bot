import { Scenes } from 'telegraf';
import { getUser, getUserBookings, updateUserSessions, deleteBooking } from '../database/supabase.js';
import { isWithin24Hours, notifyAdmin } from '../utils/helpers.js';

export const cancelWizard = new Scenes.WizardScene(
  'cancel-wizard',
  async (ctx) => {
    const bookings = await getUserBookings(ctx.from.id);
    
    if (bookings.length === 0) {
      await ctx.reply('❌ Нет будущих записей.');
      return ctx.scene.leave();
    }
    
    ctx.wizard.state.bookingsList = bookings;
    
    const keyboard = bookings.map((b, index) => ([{ 
      text: `${b.trainer_name} — ${b.datetime.split('T')[0]} ${b.datetime.split('T')[1].substring(0,5)}`, 
      callback_data: `cancel_${index}` 
    }]));
    
    await ctx.reply('❌ Выберите запись для отмены:', {
      reply_markup: { inline_keyboard: [...keyboard, [{ text: '🔙 Назад', callback_data: 'back' }]] }
    });
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    await ctx.answerCbQuery();
    
    if (ctx.callbackQuery.data === 'back') {
      return ctx.scene.leave();
    }
    
    const bookingIndex = parseInt(ctx.callbackQuery.data.split('_')[1]);
    const booking = ctx.wizard.state.bookingsList?.[bookingIndex];
    const user = await getUser(ctx.from.id);
    
    if (!booking) {
      await ctx.reply('❌ Запись не найдена.');
      return ctx.scene.leave();
    }
    
    const within24 = isWithin24Hours(booking.datetime);
    
    if (within24) {
      await ctx.reply('⚠️ Отмена менее чем за 24 часа! Тренировка будет списана. Подтверждаете?', {
        reply_markup: { inline_keyboard: [[{ text: '✅ Да', callback_data: 'confirm_cancel' }], [{ text: '❌ Нет', callback_data: 'back' }]] }
      });
      ctx.wizard.state.bookingToCancel = { booking, user, within24 };
      return ctx.wizard.next();
    } else {
      await updateUserSessions(ctx.from.id, user.sessions_left + 1);
      await deleteBooking(booking.id, booking.schedule_id);
      await ctx.reply(`✅ Отменено. Тренировка возвращена. Осталось: ${user.sessions_left + 1}`);
      await notifyAdmin(process.env.ADMIN_ID, `🔄 Отмена (бесплатно): @${ctx.from.username || ctx.from.id}`);
      return ctx.scene.leave();
    }
  },
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    await ctx.answerCbQuery();
    
    const { booking, user, within24 } = ctx.wizard.state.bookingToCancel;
    await deleteBooking(booking.id, booking.schedule_id);
    
    const updatedUser = await getUser(ctx.from.id);
    await ctx.reply(`✅ Отменено. Тренировка списана. Осталось: ${updatedUser.sessions_left}`);
    await notifyAdmin(process.env.ADMIN_ID, `🔄 Отмена (штраф): @${ctx.from.username || ctx.from.id}`);
    
    return ctx.scene.leave();
  }
);