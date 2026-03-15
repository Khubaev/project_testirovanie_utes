import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Мокируем db.js до импорта роутера
vi.mock('../db.js', () => {
  const mockFrom = vi.fn();
  const supabase = { from: mockFrom };
  return { default: supabase };
});

import supabase from '../db.js';
import surveysRouter from '../routes/surveys.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/surveys', surveysRouter);
  return app;
}

// Хелпер: строит цепочку вызовов Supabase (.from().select().eq()...)
function mockChain(overrides = {}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    ...overrides,
  };
  supabase.from.mockReturnValue(chain);
  return chain;
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const CHECK_UUID_FALSE = 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeee0001';
const CHECK_UUID_TRUE  = 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeee0002';
const VALID_BODY = {
  device_id: VALID_UUID,
  service_quality: 4,
  cost_rating: 3,
  cleaning_quality: 5,
  reception_quality: 2,
  food_quality: 4,
  service_zone_quality: 3,
};

describe('GET /api/surveys/rooms', () => {
  it('возвращает список комнат', async () => {
    const chain = mockChain();
    chain.order.mockResolvedValue({ data: [{ id: 1, name: '101' }], error: null });

    const res = await request(buildApp()).get('/api/surveys/rooms');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, name: '101' }]);
  });

  it('возвращает пустой массив при ошибке Supabase', async () => {
    const chain = mockChain();
    chain.order.mockResolvedValue({ data: null, error: new Error('db error') });

    const res = await request(buildApp()).get('/api/surveys/rooms');
    expect(res.status).toBe(500);
  });
});

describe('POST /api/surveys — валидация', () => {
  it('400 при отсутствии body', async () => {
    const res = await request(buildApp())
      .post('/api/surveys')
      .set('Content-Type', 'application/json')
      .send('');
    expect(res.status).toBe(400);
  });

  it('400 при невалидном device_id', async () => {
    const res = await request(buildApp())
      .post('/api/surveys')
      .send({ ...VALID_BODY, device_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/device_id/);
  });

  it('400 при отсутствии обязательного поля', async () => {
    const { service_quality: _removed, ...body } = VALID_BODY;
    const res = await request(buildApp())
      .post('/api/surveys')
      .send({ ...body, device_id: VALID_UUID });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/service_quality/);
  });

  it('400 при оценке вне диапазона 1-5', async () => {
    const res = await request(buildApp())
      .post('/api/surveys')
      .send({ ...VALID_BODY, service_quality: 6 });
    expect(res.status).toBe(400);
  });

  it('409 если device_id уже существует в БД', async () => {
    const chain = mockChain();
    // select count = 1 (уже есть запись)
    chain.eq.mockResolvedValue({ error: null, count: 1 });

    const res = await request(buildApp())
      .post('/api/surveys')
      .send(VALID_BODY);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/уже отправили/);
  });

  it('201 при успешном сохранении', async () => {
    const chain = mockChain();
    // Первый вызов — проверка дубликата (count = 0)
    chain.eq.mockResolvedValueOnce({ error: null, count: 0 });
    // Второй вызов — insert
    chain.single.mockResolvedValue({ data: { id: 42 }, error: null });

    const res = await request(buildApp())
      .post('/api/surveys')
      .send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });
});

describe('GET /api/surveys/check', () => {
  it('400 при отсутствии device_id', async () => {
    const res = await request(buildApp()).get('/api/surveys/check');
    expect(res.status).toBe(400);
  });

  it('400 при невалидном device_id', async () => {
    const res = await request(buildApp()).get('/api/surveys/check?device_id=bad-id');
    expect(res.status).toBe(400);
  });

  it('submitted: false если записи нет', async () => {
    const chain = mockChain();
    chain.eq.mockResolvedValue({ error: null, count: 0 });

    const res = await request(buildApp())
      .get(`/api/surveys/check?device_id=${CHECK_UUID_FALSE}`);
    expect(res.status).toBe(200);
    expect(res.body.submitted).toBe(false);
  });

  it('submitted: true если запись есть', async () => {
    const chain = mockChain();
    chain.eq.mockResolvedValue({ error: null, count: 1 });

    const res = await request(buildApp())
      .get(`/api/surveys/check?device_id=${CHECK_UUID_TRUE}`);
    expect(res.status).toBe(200);
    expect(res.body.submitted).toBe(true);
  });
});

describe('GET /api/surveys/stats', () => {
  it('возвращает total и averages', async () => {
    const chain = mockChain();
    chain.select.mockResolvedValue({
      data: [
        { service_quality: 4, cost_rating: 3, cleaning_quality: 5, reception_quality: 2, food_quality: 4, service_zone_quality: null },
        { service_quality: 2, cost_rating: 5, cleaning_quality: 3, reception_quality: 4, food_quality: null, service_zone_quality: 3 },
      ],
      error: null,
      count: 2,
    });

    const res = await request(buildApp()).get('/api/surveys/stats');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.averages.service_quality).toBe(3); // (4+2)/2
    expect(res.body.averages.food_quality).toBe(4);    // только 1 не-null значение
    expect(res.body.averages.service_zone_quality).toBe(3); // только 1 не-null
  });

  it('возвращает null для averages при total=0', async () => {
    const chain = mockChain();
    chain.select.mockResolvedValue({ data: [], error: null, count: 0 });

    const res = await request(buildApp()).get('/api/surveys/stats');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.averages.service_quality).toBeNull();
  });
});

describe('GET /api/surveys/responses — защита API-ключом', () => {
  it('401 при заданном STATS_API_KEY и отсутствии заголовка', async () => {
    process.env.STATS_API_KEY = 'secret123';

    const chain = mockChain();
    chain.range.mockResolvedValue({ data: [], error: null, count: 0 });

    const res = await request(buildApp()).get('/api/surveys/responses');
    expect(res.status).toBe(401);
    delete process.env.STATS_API_KEY;
  });

  it('200 при корректном API-ключе', async () => {
    process.env.STATS_API_KEY = 'secret123';

    const chain = mockChain();
    chain.range.mockResolvedValue({ data: [], error: null, count: 0 });

    const res = await request(buildApp())
      .get('/api/surveys/responses')
      .set('x-api-key', 'secret123');
    expect(res.status).toBe(200);
    delete process.env.STATS_API_KEY;
  });

  it('200 если STATS_API_KEY не задан (dev-режим)', async () => {
    delete process.env.STATS_API_KEY;

    const chain = mockChain();
    chain.range.mockResolvedValue({ data: [], error: null, count: 0 });

    const res = await request(buildApp()).get('/api/surveys/responses');
    expect(res.status).toBe(200);
  });
});
