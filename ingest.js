import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config(); // .env в корне

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const DATA_DIR = join(process.cwd(), 'mock_knowledge_base');
const CHUNK_SIZE = 500;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPENROUTER_API_KEY,
});

function splitTextIntoChunks(text, maxLength = CHUNK_SIZE) {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = '';
  for (const para of paragraphs) {
    if (currentChunk.length + para.length + 2 <= maxLength) {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = para;
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

async function ingest() {
  console.log(`📁 Читаем файлы из: ${DATA_DIR}`);
  const files = await readdir(DATA_DIR);
  let totalChunks = 0;

  for (const file of files) {
    if (!file.endsWith('.txt')) continue;
    console.log(`📄 Обработка: ${file}`);
    const content = await readFile(join(DATA_DIR, file), 'utf-8');
    const chunks = splitTextIntoChunks(content);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`   🔢 Генерируем эмбеддинг для чанка ${i+1}/${chunks.length}...`);
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: chunk,
      });
      const embedding = embeddingResponse.data[0].embedding;

      const { error } = await supabase.from('knowledge_base').insert({
        content: chunk,
        embedding,
        metadata: { source: file, chunk_index: i },
      });

      if (error) {
        console.error(`❌ Ошибка вставки в ${file}, чанк ${i}:`, error);
      } else {
        totalChunks++;
        console.log(`   ✅ Чанк ${i+1} загружен`);
      }
    }
  }
  console.log(`\n✅ Загружено фрагментов: ${totalChunks}`);
}

ingest().catch(console.error);