# Анонимное Анкетирование

Веб-приложение для учёта анкет гостей: одна страница с формой (6 вопросов, оценка 1–5) и полями для комментариев под каждым вопросом. Предназначено для перехода гостей по QR-коду. Статистика доступна только через API.

## Требования

- Node.js 20+
- npm
- Supabase аккаунт с проектом (используем как управляемый PostgreSQL)
- (Опционально) локальный PostgreSQL (подключение: localhost, пользователь `admin`, пароль `admin`, БД по умолчанию `postgres`)

## Установка

```bash
# Сервер
cd server
npm install

# Клиент (в корне проекта)
cd client
npm install
```

## Настройка БД в Supabase

1. Создайте проект в Supabase.
2. В разделе **SQL** выполните скрипт создания таблиц (сначала справочник комнат, затем ответы):

```sql
-- Справочник номеров комнат (отдельная сущность)
create table if not exists public.room_numbers (
  id serial primary key,
  name varchar(50) not null,
  created_at timestamptz default now()
);

-- Ответы анкеты (ссылка на room_numbers)
create table if not exists public.survey_responses (
  id serial primary key,
  created_at timestamptz default now(),
  device_id text unique,
  room_id int references public.room_numbers(id),
  service_quality smallint not null check (service_quality between 1 and 5),
  cost_rating smallint not null check (cost_rating between 1 and 5),
  cleaning_quality smallint not null check (cleaning_quality between 1 and 5),
  reception_quality smallint not null check (reception_quality between 1 and 5),
  food_quality smallint check (food_quality between 1 and 5),
  service_zone_quality smallint check (service_zone_quality between 1 and 5),
  service_comment text,
  cost_comment text,
  cleaning_comment text,
  reception_comment text,
  food_comment text,
  service_zone_comment text
);

create index if not exists idx_survey_responses_room_id on public.survey_responses(room_id);
```

Добавьте номера комнат в справочник (пример):

```sql
insert into public.room_numbers (name) values ('101'), ('102'), ('205-A'), ('Корпус 2 — 305');
```

Если таблица `survey_responses` уже была с полем `room_number`, перейдите на ссылку на сущность:

```sql
create table if not exists public.room_numbers (
  id serial primary key,
  name varchar(50) not null,
  created_at timestamptz default now()
);

alter table public.survey_responses add column if not exists room_id int references public.room_numbers(id);
create index if not exists idx_survey_responses_room_id on public.survey_responses(room_id);
-- при необходимости удалите старую колонку: alter table public.survey_responses drop column if exists room_number;
```

3. В разделе **Settings → API** скопируйте:
   - `Project URL` → `SUPABASE_URL`
   - `service_role key` → `SUPABASE_SERVICE_KEY` (используется только на бэкенде!).

4. Создайте файл `.env` в папке `server`:

```bash
SUPABASE_URL=ваш_URL_из_Supabase
SUPABASE_SERVICE_KEY=ваш_service_role_key_из_Supabase
```

5. Для Docker добавьте те же переменные в окружение (в `docker-compose.yml` или `.env` рядом с ним).

### Старый вариант: локальный PostgreSQL

Реализация для локального PostgreSQL оставлена в комментариях в `server/src/db.js`, а также в `docker-compose.yml`. При желании вы можете раскомментировать эти настройки и вернуться к локальному PostgreSQL, запустив миграцию:

```bash
cd server
npm run migrate
```

## Запуск

### Режим разработки

В двух терминалах:

**Терминал 1 — бэкенд (порт 3000):**
```bash
cd server
npm run dev
```

**Терминал 2 — фронтенд (порт 5173):**
```bash
cd client
npm run dev
```

Откройте в браузере: http://localhost:5173  
Запросы к API идут через proxy на http://localhost:3000.

### Продакшен

Соберите фронтенд и запустите один сервер:

```bash
cd client
npm run build
cd ../server
npm start
```

Установите переменную окружения для продакшена:
```bash
set NODE_ENV=production
npm start
```

Сервер будет отдавать статику из `client/dist` и API на порту 3000. Откройте http://localhost:3000.

## API

- `POST /api/surveys` — отправить ответ анкеты. Тело JSON:
  - `service_quality` (1–5) — качество дополнительных услуг (аниматоры, SPA)
  - `cost_rating` (1–5) — стоимость услуг (1 — очень дорого, 5 — доступно)
  - `cleaning_quality` (1–5) — качество уборки (1 — очень грязно, 5 — очень чисто)
  - `reception_quality` (1–5) — работа зоны ресепшен (1 — очень плохо, 5 — очень хорошо)
  - `food_quality` (1–5) — питание на курорте (1 — очень плохо, 5 — очень хорошо)
  - `service_zone_quality` (1–5) — сервис в зоне шведки, ресторане, баре (1 — очень плохо, 5 — очень хорошо)
  - дополнительные текстовые поля-комментарии под каждым вопросом
  - `room_id` (необязательно) — id из справочника номеров комнат
- `GET /api/surveys/rooms` — список комнат для выбора в опроснике (поля `id`, `name`).
- `GET /api/surveys/check?device_id=...` — проверка, отправлял ли уже анкету это устройство.
- `GET /api/surveys/responses` — список ответов с фильтром и пагинацией (для 200+ записей): параметры `room_id` (фильтр по номеру комнаты — id из справочника), `limit` (по умолчанию 50, макс. 200), `offset` (по умолчанию 0). В каждом элементе `data` есть `room_id` и вложенный объект `room_numbers: { id, name }`. Ответ: `{ total, limit, offset, data: [...] }`.
- `GET /api/surveys/stats` — статистика: количество ответов и средние оценки.

## Вопросы анкеты

1. Оцените качество дополнительных услуг (аниматоры, посещение SPA) — 1–5
2. Оцените стоимость услуг (1 — очень дорого, 5 — доступно)
3. Оцените качество уборки (1 — очень грязно, 5 — очень чисто)
4. Оцените работу зоны Ресепшен (1 — очень плохо, 5 — очень хорошо)
5. Как вы оцениваете питание на курорте (1 — очень плохо, 5 — очень хорошо)
6. Оцените сервис в зоне шведки, ресторане, баре (1 — очень плохо, 5 — очень хорошо)

Под каждым вопросом есть дополнительное поле, где гость может подробно описать, что именно понравилось или не понравилось (до 2000 символов).

Данные хранятся в Supabase (PostgreSQL).

### Быстродействие и безопасность

- **Rate limit:** не более 60 запросов в минуту с одного IP к `/api/*`; при превышении — ответ «Слишком много запросов».
- **Сжатие:** ответы отдаются с gzip (middleware `compression`).
- **Заголовки безопасности:** Helmet (X-Content-Type-Options, X-Frame-Options и др.).
- **Ограничение тела запроса:** до 100 КБ на запрос.
- **Валидация:** `device_id` только в формате UUID; комментарии обрезаются до 2000 символов и санитизируются.
- **Кэш для GET /check:** результат проверки «уже отправлял» кэшируется в памяти на 60 секунд, чтобы реже обращаться к Supabase при повторных заходах.

Переменные окружения для Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. Для локального PostgreSQL (если вернётесь): `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.

---

## Деплой на облачном сервере (HTTPS / HTTP)

Пошаговая инструкция по развёртыванию с **HTTPS** в продакшене (Nginx + Let's Encrypt) и **HTTP** для отладки — в файле [DEPLOY.md](DEPLOY.md).

---

## Docker

Запуск всего приложения (PostgreSQL + API и фронт) одной командой:

```bash
docker compose up --build
```

Приложение будет доступно по адресу http://localhost:3000. Таблица `survey_responses` создаётся автоматически при первом старте (миграция встроена в запуск сервера).

Остановка:

```bash
docker compose down
```

Данные БД сохраняются в volume `postgres_data`. Чтобы сбросить БД, выполните `docker compose down -v`.

### Доступ к PostgreSQL в Docker

**Через терминал (psql внутри контейнера):**

```bash
docker compose exec postgres psql -U admin -d postgres
```

Полезные команды в `psql`:
- `\dt` — список таблиц (таблица анкет: `survey_responses`);
- `\d survey_responses` — структура таблицы;
- `SELECT * FROM survey_responses;` — все записи;
- `\q` — выход.

**Через графический клиент (pgAdmin, DBeaver и т.п.):**

Порт 5432 проброшен на хост. Параметры подключения:
- **Хост:** `localhost`
- **Порт:** `5432`
- **Пользователь:** `admin`
- **Пароль:** `admin`
- **База данных:** `postgres`

Таблица с ответами анкеты: `survey_responses`.

**Если в таблице пусто, а в браузере «Вы уже отправили анкету»:** вы смотрите не ту базу или анкета уходила не в Docker. Открывайте только http://localhost:3000 (не 5173), не запускайте локальный сервер (npm run dev в server). В GUI подключайтесь к localhost:5432 и убедитесь, что других PostgreSQL на этом порту нет. Очистите для сайта Local Storage (ключи `guest_survey_submitted`, `guest_survey_device_id`), отправьте анкету заново и снова выполните `SELECT * FROM survey_responses;`.
