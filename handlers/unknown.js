import { handleAIQuery } from './ai.js';

const dangerousPatterns = [
  // Русский
  /\bзабудь\b/i,
  /\bигнорируй\b/i,
  /\bты больше не\b/i,
  /\bтеперь ты\b/i,
  /\bотмени все правила\b/i,
  /\bпромпт\b/i,
  /\bsystem prompt\b/i,
  /\bинструкции\b/i,
  /\bзабудь все инструкции\b/i,
  /\bигнорируй предыдущие\b/i,
  /\bсмени роль\b/i,
  /\bты хакер\b/i,
  /\bвзломай\b/i,
  
  // English
  /\bforget\b/i,
  /\bignore\b/i,
  /\byou are no longer\b/i,
  /\bnow you are\b/i,
  /\boverride all rules\b/i,
  /\bprompt\b/i,
  /\binstructions\b/i,
  /\bforget all instructions\b/i,
  /\bignore previous\b/i,
  /\bchange role\b/i,
  /\byou are a hacker\b/i,
  /\bhack\b/i,
  /\bsystem message\b/i,
  /\bnew instruction\b/i,
  /\bdisregard\b/i,
  
  // Українська
  /\bзабудь\b/i,
  /\bігноруй\b/i,
  /\bти більше не\b/i,
  /\bтепер ти\b/i,
  /\bскасуй всі правила\b/i,
  /\bпромпт\b/i,
  /\bінструкції\b/i,
  /\bзламай\b/i,
  
  // Deutsch
  /\bvergiss\b/i,
  /\bignoriere\b/i,
  /\bdu bist nicht mehr\b/i,
  /\bjetzt bist du\b/i,
  
  // Français
  /\boublie\b/i,
  /\bignore\b/i,
  /\btu n'es plus\b/i,
  /\bmaintenant tu es\b/i,
  
  // Español
  /\bolvida\b/i,
  /\bignora\b/i,
  /\bya no eres\b/i,
  /\bahora eres\b/i,
];

export function setupUnknownHandler(bot) {
  console.log('✅ setupUnknownHandler ВЫЗВАН');
  
  bot.on('text', async (ctx) => {
    console.log('🔍 ПОЛУЧЕН ТЕКСТ:', ctx.message.text);
    
    if (ctx.message.text.startsWith('/')) return;
    if (ctx.session?.__scenes?.current) return;
    
    const menuButtons = ['📅 Записаться', '❌ Отменить', '💪 Мой абонемент', '📋 Мои записи', '❓ Помощь', '👑 Админ-панель'];
    if (menuButtons.includes(ctx.message.text)) return;
    
    const lowerText = ctx.message.text.toLowerCase();
    const isDangerous = dangerousPatterns.some(pattern => pattern.test(lowerText));
    if (isDangerous) {
      console.log('⚠️ Обнаружена попытка взлома:', ctx.message.text);
      await ctx.reply('❌ Извините, я не могу обработать этот запрос. Пожалуйста, используйте кнопки меню или /start');
      return;
    }
    
    console.log('🚀 ОТПРАВЛЯЕМ В AI:', ctx.message.text);
    
    try {
      await ctx.replyWithChatAction('typing');
      const aiResponse = await handleAIQuery(ctx.message.text, ctx.from.id);
      await ctx.reply(aiResponse);
    } catch (error) {
      console.error('❌ Ошибка при вызове AI:', error);
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже или напишите @admin');
    }
  });
}
