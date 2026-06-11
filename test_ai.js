import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

const models = [
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super:free',
  'openrouter/free',
  'openai/gpt-oss-120b:free',
];

async function testModel(model) {
  console.log(`\n🔍 Тестируем: ${model}`);
  try {
    const response = await client.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: 'Скажи "работает" на русском' }],
      max_tokens: 30,
    });
    console.log(`✅ РАБОТАЕТ! Ответ: ${response.choices[0].message.content}`);
    return true;
  } catch (error) {
    console.log(`❌ НЕ РАБОТАЕТ: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Поиск рабочей бесплатной модели...\n');
  for (const model of models) {
    const works = await testModel(model);
    if (works) {
      console.log(`\n🎯 ИСПОЛЬЗУЙТЕ В БОТЕ: ${model}`);
      break;
    }
  }
}

main();