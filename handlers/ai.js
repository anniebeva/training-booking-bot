import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { getNearestSessions, getUserBookings } from '../database/supabase.js';

let openrouter = null;
let supabase = null;

export function initAI(apiKey, supabaseUrl, supabaseAnonKey) {
  openrouter = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://t.me/your_bot',
      'X-Title': 'Training Booking Bot',
    },
  });
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

async function searchKnowledgeBase(query, matchCount = 3) {
  if (!openrouter || !supabase) return [];
  try {
    const embeddingResponse = await openrouter.embeddings.create({
      model: 'text-embedding-ada-002',
      input: query,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;
    const { data, error } = await supabase.rpc('match_knowledge', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: matchCount,
    });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('❌ Ошибка поиска в knowledge_base:', err);
    return [];
  }
}

async function classifyIntent(userMessage) {
  const prompt = `Ты классификатор запросов фитнес-бота. Определи намерение пользователя и параметры.
Намерения:
- schedule: вопрос о расписании тренировок (конкретного тренера или вообще)
- my_bookings: вопрос о своих записях ("моя тренировка", "когда у меня тренировка")
- price: вопрос о ценах, абонементах
- general: общий вопрос (о тренерах, политике, FAQ)

Ответь строго в формате: intent: ... trainer: ... 
где trainer может быть "Анна", "Дмитрий" или "none".
Примеры:
Вопрос: "Когда тренировка у Анны?" -> intent: schedule trainer: Анна
Вопрос: "Во сколько у меня следующая тренировка?" -> intent: my_bookings trainer: none
Вопрос: "Сколько стоит абонемент?" -> intent: price trainer: none
Вопрос: "Расскажи о тренере Дмитрии" -> intent: general trainer: Дмитрий

Вопрос пользователя: "${userMessage}"
Ответ:`;

  const response = await openrouter.chat.completions.create({
    model: 'google/gemma-4-31b-it:free',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 50,
  });
  const result = response.choices[0].message.content;
  console.log('Классификация LLM:', result);
  const intentMatch = result.match(/intent:\s*(\w+)/i);
  const trainerMatch = result.match(/trainer:\s*(\w+)/i);
  const intent = intentMatch ? intentMatch[1] : 'general';
  let trainer = trainerMatch ? trainerMatch[1] : null;
  if (trainer === 'none') trainer = null;
  return { intent, trainer };
}

export async function handleAIQuery(userMessage, telegramId) {
  if (!openrouter) {
    return '❌ AI не настроен. Напишите администратору: @admin';
  }

  let intent, trainer;
  try {
    const classification = await classifyIntent(userMessage);
    intent = classification.intent;
    trainer = classification.trainer;
  } catch (err) {
    console.error('Ошибка классификации, используем general', err);
    intent = 'general';
    trainer = null;
  }

  if (intent === 'my_bookings') {
    const bookings = await getUserBookings(telegramId);
    if (bookings && bookings.length > 0) {
      const next = bookings[0];
      const date = next.datetime.split('T')[0];
      const time = next.datetime.split('T')[1].substring(0,5);
      return `📅 Ваша ближайшая тренировка: ${next.trainer_name} — ${date} в ${time}.\n\nХотите отменить? Используйте кнопку "❌ Отменить".\n\nНажмите /start для главного меню.`;
    } else {
      return `У вас нет предстоящих тренировок. Чтобы записаться, нажмите "📅 Записаться".\n\nНажмите /start для главного меню.`;
    }
  }

  if (intent === 'schedule') {
    try {
      const sessions = await getNearestSessions(trainer, 3);
      if (sessions && sessions.length > 0) {
        let reply = '📅 *Ближайшие тренировки*:\n\n';
        for (const s of sessions) {
          const trainerName = s.trainers?.name || 'тренер';
          const specialty = s.trainers?.specialty ? ` (${s.trainers.specialty})` : '';
          reply += `• ${trainerName}${specialty} — ${s.date} в ${s.time.substring(0,5)}\n`;
        }
        reply += '\nЗаписаться можно через кнопку "📅 Записаться".\nНажмите /start для главного меню.';
        return reply;
      } else {
        return '😕 Не нашёл ближайших тренировок. Попробуйте посмотреть расписание через кнопку "📅 Записаться".\nНажмите /start.';
      }
    } catch (err) {
      console.error('Ошибка получения расписания:', err);
      return '❌ Не удалось получить расписание. Попробуйте позже.';
    }
  }

  if (intent === 'price') {
    const relevantChunks = await searchKnowledgeBase(userMessage);
    const context = relevantChunks.map(c => c.content).join('\n---\n');
    const pricePrompt = `Ты — ассистент фитнес-бота. Ответь на вопрос о ценах, используя этот контекст. Кратко (2-4 предложения). Если контекст не даёт ответа, скажи, что информации нет.\nКонтекст:\n${context || 'Нет информации'}\n\nВопрос: ${userMessage}\nОтвет:`;
    const response = await openrouter.chat.completions.create({
      model: 'google/gemma-4-31b-it:free',
      messages: [{ role: 'user', content: pricePrompt }],
      temperature: 0.3,
      max_tokens: 300,
    });
    return response.choices[0].message.content + '\n\nНажмите /start для главного меню.';
  }

  const relevantChunks = await searchKnowledgeBase(userMessage);
  const context = relevantChunks.map(c => c.content).join('\n---\n');
  console.log(`📚 Найдено ${relevantChunks.length} фрагментов`);
  const generalPrompt = `Ты — ассистент фитнес-бота. Ответь на вопрос, используя контекст. Кратко (2-4 предложения). Если контекст не помогает, скажи, что не знаешь, и предложи написать @admin.\nКонтекст:\n${context || 'Нет информации'}\n\nВопрос: ${userMessage}\nОтвет:`;
  const response = await openrouter.chat.completions.create({
    model: 'google/gemma-4-31b-it:free',
    messages: [{ role: 'user', content: generalPrompt }],
    temperature: 0.3,
    max_tokens: 300,
  });
  return response.choices[0].message.content + '\n\nНажмите /start для главного меню.';
}