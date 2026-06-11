import { handleAIQuery } from './ai.js';

export function setupUnknownHandler(bot) {
  console.log('✅ setupUnknownHandler ВЫЗВАН');
  
  bot.on('text', async (ctx) => {
    console.log('🔍 ПОЛУЧЕН ТЕКСТ:', ctx.message.text);
    
    // Пропускаем команды
    if (ctx.message.text.startsWith('/')) {
      console.log('➡️ Команда, пропускаем');
      return;
    }
    
    // Пропускаем, если внутри сцены
    if (ctx.session?.__scenes?.current) {
      console.log('➡️ Внутри сцены, пропускаем');
      return;
    }
    
    // Пропускаем кнопки меню
    const menuButtons = ['📅 Записаться', '❌ Отменить', '💪 Мой абонемент', '📋 Мои записи', '❓ Помощь', '👑 Админ-панель'];
    if (menuButtons.includes(ctx.message.text)) {
      console.log('➡️ Кнопка меню, пропускаем');
      return;
    }
    
    console.log('🚀 ОТПРАВЛЯЕМ В AI:', ctx.message.text);
    
    try {
      // Показываем, что бот печатает (с обработкой ошибки сети)
      try {
        await ctx.replyWithChatAction('typing');
      } catch (typingError) {
        console.log('⚠️ Индикатор печати не отправлен, продолжаем...');
      }
      
      console.log('🤖 Вызываем handleAIQuery...');
      const aiResponse = await handleAIQuery(ctx.message.text);
      console.log('✅ Получен ответ от AI:', aiResponse);
      
      await ctx.reply(aiResponse);
    } catch (error) {
      console.error('❌ Ошибка при вызове AI:', error);
      await ctx.reply('❌ Произошла ошибка при обработке запроса. Попробуйте позже или напишите @admin');
    }
  });
}