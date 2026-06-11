import { handleAIQuery } from './ai.js';

export function setupUnknownHandler(bot) {
  
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
    const menuButtons = ['📅 Записаться', '❌ Отменить', '💪 Мой абонемент', '📋 Мои записи', '❓ Помощь', '👑 Админ-панель'];
    if (menuButtons.includes(ctx.message.text)) {
      return;
    }
    
    // Показываем, что бот печатает
    await ctx.replyWithChatAction('typing');
    
    // Отправляем вопрос в AI
    const aiResponse = await handleAIQuery(ctx.message.text);
    await ctx.reply(aiResponse);
  });
}