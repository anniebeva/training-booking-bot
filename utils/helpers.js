// Утилиты и уведомления
let botInstance = null;

export function setBotInstance(bot) {
  botInstance = bot;
}

export function isWithin24Hours(datetimeStr) {
  const bookingTime = new Date(datetimeStr);
  const now = new Date();
  const hoursDiff = (bookingTime - now) / (1000 * 60 * 60);
  return hoursDiff < 24;
}

export async function notifyAdmin(ADMIN_ID, message) {
  if (!botInstance) {
    console.error('Бот не инициализирован для уведомлений');
    return;
  }
  
  console.log('📢 Отправка уведомления админу:', message);
  
  try {
    await botInstance.telegram.sendMessage(ADMIN_ID, message);
    console.log('✅ Уведомление отправлено');
  } catch (error) {
    console.error('❌ Ошибка при отправке уведомления:', error.message);
  }
}