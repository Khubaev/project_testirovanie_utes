// Реализация для локального PostgreSQL (оставлена закомментированной на всякий случай)
// import pg from 'pg';
// const { Pool } = pg;
// const pool = new Pool({
//   host: process.env.PGHOST || 'localhost',
//   port: parseInt(process.env.PGPORT || '5432', 10),
//   user: process.env.PGUSER || 'admin',
//   password: process.env.PGPASSWORD || 'admin',
//   database: process.env.PGDATABASE || 'db_testirovanie',
// });
// async function initPg() {
//   const client = await pool.connect();
//   try {
//     await client.query(`
//       CREATE TABLE IF NOT EXISTS survey_responses (
//         id SERIAL PRIMARY KEY,
//         created_at TIMESTAMPTZ DEFAULT NOW(),
//         device_id VARCHAR(255) UNIQUE,
//         service_quality SMALLINT NOT NULL CHECK(service_quality BETWEEN 1 AND 5),
//         cost_rating SMALLINT NOT NULL CHECK(cost_rating BETWEEN 1 AND 5),
//         cleaning_quality SMALLINT NOT NULL CHECK(cleaning_quality BETWEEN 1 AND 5),
//         reception_quality SMALLINT NOT NULL CHECK(reception_quality BETWEEN 1 AND 5),
//         food_quality SMALLINT CHECK(food_quality BETWEEN 1 AND 5),
//         service_zone_quality SMALLINT CHECK(service_zone_quality BETWEEN 1 AND 5),
//         service_comment TEXT,
//         cost_comment TEXT,
//         cleaning_comment TEXT,
//         reception_comment TEXT,
//         food_comment TEXT,
//         service_zone_comment TEXT
//       )
//     `);
//   } finally {
//     client.release();
//   }
// }

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  // Явная ошибка, чтобы не писать в неизвестную БД
  throw new Error('Supabase env vars SUPABASE_URL и SUPABASE_SERVICE_KEY не заданы');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// Для Supabase структура таблицы настраивается через панель Supabase / SQL-миграции.
// Здесь init просто проверяет возможность подключения.
async function init() {
  const { error } = await supabase.from('survey_responses').select('id').limit(1);
  if (error && error.code !== 'PGRST116') {
    // PGRST116 — таблица не найдена. В этом случае просто сообщаем об ошибке явно.
    throw error;
  }
}

export { supabase, init };
export default supabase;
