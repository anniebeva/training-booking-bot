import { Scenes } from 'telegraf';
import { getSupabase } from '../database/supabase.js';
import { 
  getUser, getTrainers, getFreeSlots, getScheduleSlotById,
  updateUserSessions, createBooking, incrementBookedSlots
} from '../database/supabase.js';
import { notifyAdmin } from '../utils/helpers.js';

console.log('✅ bookingWizard файл загружен');

export const bookingWizard = new Scenes.WizardScene(
  'booking-wizard',
  async (ctx) => {
    console.log('📍 Шаг 1: выбор тренера');
    const trainers = await getTrainers();
    const keyboard = trainers.map(t => ([{ text: `${t.name} — ${t.specialty}`, callback_data: `trainer_${t.id}` }]));
    await ctx.reply('🏋️ Выберите тренера:', {
      reply_markup: { inline_keyboard: [...keyboard, [{ text: '❌ Отмена', callback_data: 'cancel' }]] }
    });
    ctx.wizard.state.booking = {};
    return ctx.wizard.next();
  },
  async (ctx) => {
    console.log('📍 Шаг 2: выбор даты, получен callback:', ctx.callbackQuery?.data);
    if (!ctx.callbackQuery) return;
    await ctx.answerCbQuery();
    
    if (ctx.callbackQuery.data === 'cancel') {
      await ctx.reply('Запись отменена.');
      return ctx.scene.leave();
    }
    
    const trainerId = parseInt(ctx.callbackQuery.data.split('_')[1]);
    ctx.wizard.state.booking.trainerId = trainerId;
    const trainers = await getTrainers();
    ctx.wizard.state.booking.trainerName = trainers.find(t => t.id === trainerId).name;
    
    // Получаем все даты для этого тренера
    const { data: allSlots } = await getSupabase()
      .from('schedule')
      .select('date')
      .eq('trainer_id', trainerId)
      .gte('date', new Date().toISOString().split('T')[0]); // от сегодня

    // Ограничиваем даты: от завтра до +30 дней
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 30);

    const dateStrings = allSlots?.map(s => s.date) || [];
    const filteredDates = dateStrings.filter(d => {
      const dateObj = new Date(d);
      return dateObj >= tomorrow && dateObj <= maxDate;
    });

    const dates = [...new Set(filteredDates)]; // уникальные даты

    if (dates.length === 0) {
      await ctx.reply('❌ Нет доступных дат для этого тренера на ближайший месяц.');
      return ctx.scene.leave();
    }
    
    const keyboard = dates.map(d => ([{ text: d, callback_data: `date_${d}` }]));
    await ctx.reply('📅 Выберите дату (до 30 дней):', {
      reply_markup: { inline_keyboard: [...keyboard, [{ text: '🔙 Назад', callback_data: 'back' }]] }
    });
    return ctx.wizard.next();
  },
  async (ctx) => {
    console.log('📍 Шаг 3: выбор времени, получен callback:', ctx.callbackQuery?.data);
    if (!ctx.callbackQuery) return;
    await ctx.answerCbQuery();
    
    if (ctx.callbackQuery.data === 'back') {
      return ctx.wizard.selectStep(0);
    }
    
    const date = ctx.callbackQuery.data.split('_')[1];
    ctx.wizard.state.booking.date = date;
    
    const slots = await getFreeSlots(ctx.wizard.state.booking.trainerId, date);
    console.log('📊 Найдено слотов:', slots.length);
    
    if (slots.length === 0) {
      await ctx.reply('❌ На эту дату нет свободных мест.');
      return ctx.wizard.selectStep(1);
    }
    
    const keyboard = slots.map(s => ([{ text: `${s.time.substring(0,5)} (свободно: ${s.max_slots - s.booked_slots})`, callback_data: `time_${s.id}` }]));
    await ctx.reply('🕐 Выберите время:', {
      reply_markup: { inline_keyboard: [...keyboard, [{ text: '🔙 Назад', callback_data: 'back' }]] }
    });
    return ctx.wizard.next();
  },
  async (ctx) => {
    console.log('📍 Шаг 4: подтверждение, получен callback:', ctx.callbackQuery?.data);
    if (!ctx.callbackQuery) return;
    await ctx.answerCbQuery();
    
    if (ctx.callbackQuery.data === 'back') {
      return ctx.wizard.selectStep(1);
    }
    
    const slotId = parseInt(ctx.callbackQuery.data.split('_')[1]);
    const slot = await getScheduleSlotById(slotId);
    ctx.wizard.state.booking.slot = slot;
    
    const user = await getUser(ctx.from.id, ctx.from.username);
    await ctx.reply(
      `📝 Проверьте данные:\n👤 Тренер: ${ctx.wizard.state.booking.trainerName}\n📅 Дата: ${slot.date}\n🕐 Время: ${slot.time.substring(0,5)}\n💪 Осталось тренировок: ${user.sessions_left}\n\nПодтверждаете?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Да', callback_data: 'confirm' }],
            [{ text: '❌ Нет', callback_data: 'cancel' }]
          ]
        }
      }
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    console.log('📍 Шаг 5: финальный, получен callback:', ctx.callbackQuery?.data);
    if (!ctx.callbackQuery) return;
    await ctx.answerCbQuery();
    
    if (ctx.callbackQuery.data === 'cancel') {
      await ctx.reply('Запись отменена.');
      return ctx.scene.leave();
    }
    
    const user = await getUser(ctx.from.id, ctx.from.username);
    const slot = ctx.wizard.state.booking.slot;
    
    if (user.sessions_left <= 0) {
      await ctx.reply(`❌ У вас закончились тренировки!\n\nСвяжитесь с администратором.`);
      return ctx.scene.leave();
    }
    
    await updateUserSessions(ctx.from.id, user.sessions_left - 1);
    const bookingId = `booking_${Date.now()}_${ctx.from.id}`;
    const datetime = `${slot.date}T${slot.time}`;
    await createBooking(bookingId, ctx.from.id, slot.id, ctx.wizard.state.booking.trainerName, datetime);
    await incrementBookedSlots(slot.id);
    
    const updatedUser = await getUser(ctx.from.id);
    await ctx.reply(`✅ Вы записаны!\nОсталось тренировок: ${updatedUser.sessions_left}`);
    await notifyAdmin(process.env.ADMIN_ID, `📢 Новая запись! @${ctx.from.username || ctx.from.id} — ${slot.date} ${slot.time.substring(0,5)}`);
    
    return ctx.scene.leave();
  }
);