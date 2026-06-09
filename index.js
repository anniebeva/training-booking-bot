import { Telegraf, Scenes, session } from 'telegraf';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
async function getUser(telegramId, username = null) {
  let { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();
  
  if (error && error.code === 'PGRST116') {
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{ telegram_id: telegramId, username, sessions_left: 3 }])
      .select()
      .single();
    if (insertError) throw insertError;
    return newUser;
  }
  if (error) throw error;
  return user;
}

async function updateUserSessions(telegramId, sessionsLeft) {
  const { error } = await supabase
    .from('users')
    .update({ sessions_left: sessionsLeft })
    .eq('telegram_id', telegramId);
  if (error) throw error;
}

async function getTrainers() {
  const { data, error } = await supabase
    .from('trainers')
    .select('*')
    .order('id');
  if (error) throw error;
  return data;
}

async function getFreeSlots(trainerId, date) {
  const { data, error } = await supabase
    .from('schedule')
    .select('*')
    .eq('trainer_id', trainerId)
    .eq('date', date);
  if (error) throw error;
  return data.filter(slot => slot.booked_slots < slot.max_slots);
}

async function getScheduleSlotById(slotId) {
  const { data, error } = await supabase
    .from('schedule')
    .select('*')
    .eq('id', slotId)
    .single();
  if (error) throw error;
  return data;
}

async function incrementBookedSlots(slotId) {
  const { data: slot, error: fetchError } = await supabase
    .from('schedule')
    .select('booked_slots')
    .eq('id', slotId)
    .single();
  if (fetchError) throw fetchError;
  
  const { error: updateError } = await supabase
    .from('schedule')
    .update({ booked_slots: slot.booked_slots + 1 })
    .eq('id', slotId);
  if (updateError) throw updateError;
}

async function decrementBookedSlots(slotId) {
  const { data: slot, error: fetchError } = await supabase
    .from('schedule')
    .select('booked_slots')
    .eq('id', slotId)
    .single();
  if (fetchError) throw fetchError;
  
  const { error: updateError } = await supabase
    .from('schedule')
    .update({ booked_slots: Math.max(0, slot.booked_slots - 1) })
    .eq('id', slotId);
  if (updateError) throw updateError;
}

async function createBooking(bookingId, userId, scheduleId, trainerName, datetime) {
  const { error } = await supabase
    .from('bookings')
    .insert([{
      id: bookingId,
      user_id: userId,
      schedule_id: scheduleId,
      trainer_name: trainerName,
      datetime: datetime
    }]);
  if (error) throw error;
}

async function getUserBookings(userId) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', userId)
    .gt('datetime', new Date().toISOString())
    .order('datetime');
  if (error) throw error;
  return data || [];
}

async function getAllUserBookings(userId) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

async function deleteBooking(bookingId, scheduleId) {
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', bookingId);
  if (error) throw error;
  await decrementBookedSlots(scheduleId);
}

function isWithin24Hours(datetimeStr) {
  const bookingTime = new Date(datetimeStr);
  const now = new Date();
  const hoursDiff = (bookingTime - now) / (1000 * 60 * 60);
  return hoursDiff < 24;
}

async function notifyAdmin(message) {
  try {
    await bot.telegram.sendMessage(ADMIN_ID, message);
  } catch (error) {
    console.error("Failed to notify admin:", error.message);
  }
}

// ==================== СЦЕНА ЗАПИСИ ====================
const bookingWizard = new Scenes.WizardScene(
  'booking-wizard',
  async (ctx) => {
    const trainers = await getTrainers();
    const keyboard = trainers.map(t => ([{ text: `${t.name} — ${t.specialty}`, callback_data: `trainer_${t.id}` }]));
    await ctx.reply('🏋️ Выберите тренера:', {
      reply_markup: { inline_keyboard: [...keyboard, [{ text: '❌ Отмена', callback_data: 'cancel' }]] }
    });
    ctx.wizard.state.booking = {};
    return ctx.wizard.next();
  },
  async (ctx) => {
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
    
    const { data: allSlots } = await supabase
      .from('schedule')
      .select('date')
      .eq('trainer_id', trainerId)
      .gte('date', new Date().toISOString().split('T')[0]);
    
    const dates = [...new Set(allSlots?.map(s => s.date) || [])];
    if (dates.length === 0) {
      await ctx.reply('❌ Нет доступных дат для этого тренера.');
      return ctx.scene.leave();
    }
    
    const keyboard = dates.map(d => ([{ text: d, callback_data: `date_${d}` }]));
    await ctx.reply('📅 Выберите дату:', {
      reply_markup: { inline_keyboard: [...keyboard, [{ text: '🔙 Назад', callback_data: 'back' }]] }
    });
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    await ctx.answerCbQuery();
    
    if (ctx.callbackQuery.data === 'back') {
      return ctx.wizard.selectStep(0);
    }
    
    const date = ctx.callbackQuery.data.split('_')[1];
    ctx.wizard.state.booking.date = date;
    
    const slots = await getFreeSlots(ctx.wizard.state.booking.trainerId, date);
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
    await notifyAdmin(`📢 Новая запись! @${ctx.from.username || ctx.from.id} — ${slot.date} ${slot.time.substring(0,5)}`);
    
    return ctx.scene.leave();
  }
);

// ==================== СЦЕНА ОТМЕНЫ ====================
const cancelWizard = new Scenes.WizardScene(
  'cancel-wizard',
  async (ctx) => {
    const bookings = await getUserBookings(ctx.from.id);
    if (bookings.length === 0) {
      await ctx.reply('❌ Нет будущих записей.');
      return ctx.scene.leave();
    }
    
    const keyboard = bookings.map(b => ([{ text: `${b.trainer_name} — ${b.datetime.split('T')[0]} ${b.datetime.split('T')[1].substring(0,5)}`, callback_data: `cancel_${b.id}` }]));
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
    
    const bookingId = ctx.callbackQuery.data.split('_')[1];
    const user = await getUser(ctx.from.id);
    
    const { data: allBookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', ctx.from.id);
    
    if (error) {
      await ctx.reply('❌ Ошибка при поиске записи.');
      return ctx.scene.leave();
    }
    
    const booking = allBookings?.find(b => b.id === bookingId);
    
    if (!booking) {
      await ctx.reply('❌ Запись не найдена. Возможно, она уже была отменена.');
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
      await notifyAdmin(`🔄 Отмена (бесплатно): @${ctx.from.username || ctx.from.id}`);
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
    await notifyAdmin(`🔄 Отмена (штраф): @${ctx.from.username || ctx.from.id}`);
    
    return ctx.scene.leave();
  }
);

// ==================== НАСТРОЙКА ====================
// ... все импорты и функции остаются без изменений ...

// ==================== НАСТРОЙКА ====================
const stage = new Scenes.Stage([bookingWizard, cancelWizard]);
bot.use(session());
bot.use(stage.middleware());

// ==================== КОМАНДЫ (СНАЧАЛА) ====================
bot.start(async (ctx) => {
  const user = await getUser(ctx.from.id, ctx.from.username);
  await ctx.reply(`🏋️ Добро пожаловать!\n💪 Осталось: ${user.sessions_left} тренировок\n\nВыберите действие:`, {
    reply_markup: {
      keyboard: [
        ['📅 Записаться'],
        ['❌ Отменить', '💪 Мой абонемент'],
        ['📋 Мои записи', '❓ Помощь']
      ],
      resize_keyboard: true
    }
  });
});

bot.command('my', async (ctx) => {
  const user = await getUser(ctx.from.id);
  await ctx.reply(`💪 Осталось тренировок: ${user.sessions_left}`);
});

bot.command('recordings', async (ctx) => {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', ctx.from.id)
    .order('datetime', { ascending: true });
  
  if (error) {
    await ctx.reply('❌ Ошибка при загрузке записей');
    return;
  }
  
  if (!bookings || bookings.length === 0) {
    await ctx.reply('📭 У вас пока нет записей.');
    return;
  }
  
  let message = '📋 Ваши записи:\n\n';
  bookings.forEach((booking, index) => {
    const date = booking.datetime.split('T')[0];
    const time = booking.datetime.split('T')[1].substring(0, 5);
    message += `${index + 1}. ${booking.trainer_name} — ${date} в ${time}\n`;
  });
  
  await ctx.reply(message);
});

// ==================== КНОПКИ (ПОТОМ) ====================
bot.hears('📅 Записаться', async (ctx) => ctx.scene.enter('booking-wizard'));
bot.hears('❌ Отменить', async (ctx) => ctx.scene.enter('cancel-wizard'));

bot.hears('💪 Мой абонемент', async (ctx) => {
  const user = await getUser(ctx.from.id);
  await ctx.reply(`💪 Осталось тренировок: ${user.sessions_left}`);
});

bot.hears('📋 Мои записи', async (ctx) => {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', ctx.from.id)
    .order('datetime', { ascending: true });
  
  if (error) {
    await ctx.reply('❌ Ошибка при загрузке записей');
    return;
  }
  
  if (!bookings || bookings.length === 0) {
    await ctx.reply('📭 У вас пока нет записей.\n\nНажмите "📅 Записаться", чтобы выбрать тренировку.');
    return;
  }
  
  let message = '📋 *Ваши записи:*\n\n';
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

// ==================== ОБРАБОТЧИК НЕИЗВЕСТНОГО ТЕКСТА (В КОНЦЕ) ====================
bot.on('text', async (ctx) => {
  // Пропускаем команды
  if (ctx.message.text.startsWith('/')) {
    return;
  }
  
  // Пропускаем, если пользователь внутри сцены
  const isInScene = ctx.session?.__scenes?.current;
  if (isInScene) {
    return;
  }
  
  // Пропускаем кнопки меню
  const menuButtons = ['📅 Записаться', '❌ Отменить', '💪 Мой абонемент', '📋 Мои записи', '❓ Помощь'];
  if (menuButtons.includes(ctx.message.text)) {
    return;
  }
  
  // Всё остальное — неизвестный ввод
  await ctx.reply(
    '❓ Я вас не понял.\n\nПожалуйста, используйте кнопки меню или команду /start',
    {
      reply_markup: {
        keyboard: [
          ['📅 Записаться'],
          ['❌ Отменить', '💪 Мой абонемент'],
          ['📋 Мои записи', '❓ Помощь']
        ],
        resize_keyboard: true
      }
    }
  );
});

// ==================== ЗАПУСК ====================
bot.launch().then(() => {
  console.log('✅ Бот запущен с Supabase!');
  console.log(`👤 Admin ID: ${ADMIN_ID}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));