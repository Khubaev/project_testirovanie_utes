import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import supabase from '../db.js';

const checkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Слишком много запросов' },
});

const router = Router();

function requireApiKey(req, res, next) {
  const key = process.env.STATS_API_KEY;
  if (!key) return next(); // не задан — открытый доступ (dev-режим)
  if (req.headers['x-api-key'] !== key) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/surveys — редирект на главную, чтобы не показывать "Not Found"
router.get('/', (req, res) => res.redirect(302, '/'));

router.get('/rooms', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('room_numbers')
      .select('id, name')
      .order('name');
    if (error) throw error;
    res.json(data ?? []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load rooms' });
  }
});

const RANGE = [1, 2, 3, 4, 5];
const FIELDS = [
  'service_quality',
  'cost_rating',
  'cleaning_quality',
  'reception_quality',
  'food_quality',
  'service_zone_quality',
];

const DEVICE_ID_KEY = 'device_id';
const COMMENT_MAX_LENGTH = 2000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeComment(v) {
  if (v == null || typeof v !== 'string') return null;
  return v.trim().slice(0, COMMENT_MAX_LENGTH) || null;
}

function validateBody(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  const deviceId = body[DEVICE_ID_KEY];
  if (!deviceId || typeof deviceId !== 'string' || deviceId.trim().length === 0) {
    return res.status(400).json({ error: 'Missing or invalid device_id' });
  }
  if (!UUID_REGEX.test(deviceId.trim())) {
    return res.status(400).json({ error: 'Invalid device_id format' });
  }
  const errors = [];
  for (const field of FIELDS) {
    const v = body[field];
    if (v === undefined || v === null) {
      errors.push(`Missing field: ${field}`);
    } else {
      const n = Number(v);
      if (!Number.isInteger(n) || !RANGE.includes(n)) {
        errors.push(`Invalid ${field}: must be integer 1-5`);
      }
    }
  }
  if (errors.length) {
    return res.status(400).json({ error: errors.join('; ') });
  }
  next();
}

function parseRoomId(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

router.post('/', validateBody, async (req, res) => {
  const {
    device_id: deviceId,
    room_id: roomId,
    service_quality,
    cost_rating,
    cleaning_quality,
    reception_quality,
    food_quality,
    service_zone_quality,
    service_comment,
    cost_comment,
    cleaning_comment,
    reception_comment,
    food_comment,
    service_zone_comment,
  } = req.body;
  try {
    const { error: existingError, count } = await supabase
      .from('survey_responses')
      .select('id', { count: 'exact', head: true })
      .eq('device_id', deviceId);
    if (existingError) {
      throw existingError;
    }
    if (count && count > 0) {
      setCachedCheck(deviceId.trim(), true);
      return res.status(409).json({ error: 'Вы уже отправили анкету' });
    }

    const rid = parseRoomId(roomId);
    if (rid !== null) {
      const { data: roomExists, error: roomErr } = await supabase
        .from('room_numbers')
        .select('id')
        .eq('id', rid)
        .maybeSingle();
      if (roomErr || !roomExists) {
        return res.status(400).json({ error: 'Недопустимый номер комнаты' });
      }
    }

    const { data, error } = await supabase
      .from('survey_responses')
      .insert([
        {
          device_id: deviceId.trim(),
          room_id: rid,
          service_quality: Number(service_quality),
          cost_rating: Number(cost_rating),
          cleaning_quality: Number(cleaning_quality),
          reception_quality: Number(reception_quality),
          food_quality: food_quality != null ? Number(food_quality) : null,
          service_zone_quality: service_zone_quality != null ? Number(service_zone_quality) : null,
          service_comment: sanitizeComment(service_comment),
          cost_comment: sanitizeComment(cost_comment),
          cleaning_comment: sanitizeComment(cleaning_comment),
          reception_comment: sanitizeComment(reception_comment),
          food_comment: sanitizeComment(food_comment),
          service_zone_comment: sanitizeComment(service_zone_comment),
        },
      ])
      .select('id')
      .single();

    if (error) throw error;
    if (!data) {
      throw new Error('Insert did not return row');
    }

    setCachedCheck(deviceId.trim(), true);
    res.status(201).json({ id: data.id, ok: true });
  } catch (err) {
    console.error('Survey POST error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Вы уже отправили анкету' });
    }
    const message = err.message || 'Failed to save response';
    res.status(500).json({ error: message });
  }
});

const checkCache = new Map();
const CHECK_CACHE_TTL_MS = 60 * 1000;

// Периодически очищаем устаревшие записи кэша для предотвращения утечки памяти
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of checkCache.entries()) {
    if (now - entry.ts > CHECK_CACHE_TTL_MS) checkCache.delete(key);
  }
}, CHECK_CACHE_TTL_MS);

function getCachedCheck(deviceId) {
  const entry = checkCache.get(deviceId);
  if (!entry) return null;
  if (Date.now() - entry.ts > CHECK_CACHE_TTL_MS) {
    checkCache.delete(deviceId);
    return null;
  }
  return entry.submitted;
}

function setCachedCheck(deviceId, submitted) {
  checkCache.set(deviceId, { submitted, ts: Date.now() });
}

router.get('/check', checkLimiter, async (req, res) => {
  const deviceId = req.query.device_id;
  if (!deviceId || typeof deviceId !== 'string' || deviceId.trim().length === 0) {
    return res.status(400).json({ error: 'Missing device_id' });
  }
  const id = deviceId.trim();
  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'Invalid device_id format' });
  }
  try {
    const cached = getCachedCheck(id);
    if (cached !== null) {
      return res.json({ submitted: cached });
    }
    const { error, count } = await supabase
      .from('survey_responses')
      .select('id', { count: 'exact', head: true })
      .eq('device_id', id);
    if (error) throw error;
    const submitted = !!count && count > 0;
    setCachedCheck(id, submitted);
    res.json({ submitted });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check' });
  }
});

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 200;

router.get('/responses', requireApiKey, async (req, res) => {
  try {
    const roomIdParam = req.query.room_id;
    const roomId = roomIdParam != null && roomIdParam !== '' ? parseInt(roomIdParam, 10) : null;
    const limit = Math.min(
      Math.max(1, parseInt(req.query.limit, 10) || LIST_DEFAULT_LIMIT),
      LIST_MAX_LIMIT
    );
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    let query = supabase
      .from('survey_responses')
      .select('id, room_id, created_at, service_quality, cost_rating, cleaning_quality, reception_quality, food_quality, service_zone_quality, service_comment, cost_comment, cleaning_comment, reception_comment, food_comment, service_zone_comment, room_numbers(id, name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (roomId != null && Number.isInteger(roomId) && roomId > 0) {
      query = query.eq('room_id', roomId);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      total: count ?? 0,
      limit,
      offset,
      data: data ?? [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list responses' });
  }
});

router.get('/stats', requireApiKey, async (req, res) => {
  try {
    const { data, error, count } = await supabase
      .from('survey_responses')
      .select(
        'service_quality, cost_rating, cleaning_quality, reception_quality, food_quality, service_zone_quality',
        { count: 'exact' }
      );
    if (error) throw error;
    const total = count || 0;

    const sums = {
      service_quality: 0,
      cost_rating: 0,
      cleaning_quality: 0,
      reception_quality: 0,
      food_quality: 0,
      service_zone_quality: 0,
    };
    const counts = {
      service_quality: 0,
      cost_rating: 0,
      cleaning_quality: 0,
      reception_quality: 0,
      food_quality: 0,
      service_zone_quality: 0,
    };
    data.forEach((row) => {
      Object.keys(sums).forEach((k) => {
        const v = row[k];
        if (v != null) {
          sums[k] += Number(v);
          counts[k]++;
        }
      });
    });

    res.json({
      total,
      averages: {
        service_quality: counts.service_quality ? round(sums.service_quality / counts.service_quality) : null,
        cost_rating: counts.cost_rating ? round(sums.cost_rating / counts.cost_rating) : null,
        cleaning_quality: counts.cleaning_quality ? round(sums.cleaning_quality / counts.cleaning_quality) : null,
        reception_quality: counts.reception_quality ? round(sums.reception_quality / counts.reception_quality) : null,
        food_quality: counts.food_quality ? round(sums.food_quality / counts.food_quality) : null,
        service_zone_quality: counts.service_zone_quality ? round(sums.service_zone_quality / counts.service_zone_quality) : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

function round(n) {
  return Math.round(Number(n) * 100) / 100;
}

export default router;
