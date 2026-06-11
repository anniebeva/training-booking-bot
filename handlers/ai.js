import OpenAI from 'openai';
import { AI_SYSTEM_PROMPT } from '../utils/constants.js';

let openrouter = null;

export function initAI(apiKey) {
  openrouter = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://t.me/your_bot',
      'X-Title': 'Training Booking Bot',
    },
  });
}

export async function handleAIQuery(userMessage) {
  if (!openrouter) {
    return '❌ AI не настроен. Напишите администратору: @admin';
  }
  
  try {
    const response = await openrouter.chat.completions.create({
      model: 'deepseek/deepseek-r1:free',
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 300,
    });
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('❌ AI ошибка:', error.message);
    return '❌ Извините, я временно не могу ответить. Напишите администратору: @admin';
  }
}