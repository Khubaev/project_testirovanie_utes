# Пошаговые варианты деплоя на облачном сервере

Приложение: **клиент (React/Vite)** + **сервер (Node.js/Express)**. В продакшене сервер отдаёт собранную статику клиента и API. База данных — Supabase (вне сервера).

Ниже — три варианта развёртывания на VPS/облачном сервере (Ubuntu/Debian).

---

## Сравнение вариантов

| Вариант | Сложность | HTTPS | Подходит для |
|--------|-----------|--------|----------------|
| **1. Docker + Nginx + Let's Encrypt** | Средняя | Да | Продакшен, один сервер, домен |
| **2. Node.js + PM2 + Nginx** | Выше | Да | Без Docker, полный контроль |
| **3. Только Docker (без Nginx)** | Низкая | Нет | Тест по IP, отладка |

---

## Общая подготовка (для всех вариантов)

1. **Сервер:** VPS с Ubuntu 22.04 / Debian 12 (или аналог), права `sudo`.
2. **Домен (для HTTPS):** A-запись домена на IP сервера (например `anketa.example.com` → IP).
3. **Supabase:** проект создан, в проекте есть `SUPABASE_URL` и `SUPABASE_SERVICE_KEY` (Service Role).
4. **Подключение и обновление ОС:**
   ```bash
   ssh root@ВАШ_IP
   apt update && apt upgrade -y
   ```

---

# Вариант 1: Docker + Nginx + HTTPS (рекомендуется для продакшена)

Приложение в Docker, снаружи — Nginx (HTTP/HTTPS), сертификат — Let's Encrypt. Снаружи доступ только по HTTPS.

### Шаг 1. Установка Docker и Docker Compose

```bash
apt install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### Шаг 2. Установка Nginx и Certbot

```bash
apt install -y nginx certbot python3-certbot-nginx
```

### Шаг 3. Размещение проекта на сервере

```bash
apt install -y git
mkdir -p /var/www/anketa
cd /var/www/anketa
git clone https://github.com/ВАШ_РЕПО/проект.git .
```

Либо загрузите архив/файлы через `scp` или `rsync`.

### Шаг 4. Переменные окружения

```bash
nano .env
```

Содержимое (подставьте свои значения):

```env
NODE_ENV=production
SUPABASE_URL=https://ВАШ_ПРОЕКТ.supabase.co
SUPABASE_SERVICE_KEY=ваш_service_role_ключ
```

Сохраните (Ctrl+O, Enter, Ctrl+X).

### Шаг 5. Запуск приложения в Docker (только localhost)

```bash
cd /var/www/anketa
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Проверка: `curl -s http://127.0.0.1:3000 | head -5` — должна вернуться HTML.

### Шаг 6. Настройка Nginx

Удалите сайт по умолчанию и создайте конфиг для вашего домена:

```bash
rm -f /etc/nginx/sites-enabled/default
nano /etc/nginx/sites-available/anketa
```

Вставьте (замените `anketa.example.com` на свой домен):

```nginx
server {
    listen 80;
    server_name anketa.example.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Включите сайт и перезагрузите Nginx:

```bash
ln -sf /etc/nginx/sites-available/anketa /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### Шаг 7. Получение HTTPS-сертификата

```bash
certbot --nginx -d anketa.example.com
```

Укажите email и согласитесь с условиями. Certbot настроит 443 и пути к сертификатам.

### Шаг 8. Проверка

Откройте в браузере: `https://anketa.example.com`.

**Обновление после изменений в коде:**

```bash
cd /var/www/anketa
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

---

# Вариант 2: Node.js + PM2 + Nginx (без Docker)

Полный контроль: Node.js и PM2 на сервере, Nginx как обратный прокси, HTTPS через Certbot.

### Шаг 1. Установка Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v
```

### Шаг 2. Установка Nginx и Certbot

```bash
apt install -y nginx certbot python3-certbot-nginx
```

### Шаг 3. Размещение проекта

```bash
apt install -y git
mkdir -p /var/www/anketa
cd /var/www/anketa
git clone https://github.com/ВАШ_РЕПО/проект.git .
```

### Шаг 4. Сборка клиента и установка зависимостей сервера

```bash
cd /var/www/anketa/client
npm ci
# Если нет package-lock.json: npm install
npm run build

cd /var/www/anketa/server
npm ci --omit=dev
# Если нет package-lock.json: npm install --omit=dev
```

**Если на сервере сборка клиента падает** (ошибки Qt, Core.cpp, "Cannot open file build" и т.п.): соберите клиент на своём ПК (`cd client && npm run build`), затем загрузите папку `client/dist` на сервер в тот же путь (например `scp -r client/dist root@IP:~/project_testirovanie_utes/client/`). Либо используйте вариант 1 (Docker) — там сборка идёт внутри контейнера.

### Шаг 5. Переменные окружения для сервера

```bash
nano /var/www/anketa/server/.env
```

Содержимое:

```env
NODE_ENV=production
PORT=3000
SUPABASE_URL=https://ВАШ_ПРОЕКТ.supabase.co
SUPABASE_SERVICE_KEY=ваш_service_role_ключ
```

### Шаг 6. Установка и настройка PM2

```bash
npm install -g pm2
cd /var/www/anketa/server
pm2 start src/index.js --name anketa
pm2 save
pm2 startup
```

Выполните команду, которую выведет `pm2 startup` (обычно с `sudo env PATH=...`).

### Шаг 7. Nginx и HTTPS

Аналогично варианту 1: удалите `default`, создайте конфиг для домена (прокси на `http://127.0.0.1:3000`), включите сайт, выполните `certbot --nginx -d anketa.example.com`.

### Шаг 8. Обновление приложения

```bash
cd /var/www/anketa
git pull
cd client && npm ci && npm run build
cd ../server && npm ci --omit=dev
pm2 restart anketa
```

---

# Вариант 3: Только Docker (без Nginx, для теста по IP)

Удобно для проверки на сервере по IP без домена и HTTPS.

### Шаг 1. Установка Docker

Как в варианте 1, шаг 1 (только Docker, Nginx не нужен).

### Шаг 2. Клонирование и переменные окружения

```bash
apt install -y git
mkdir -p /var/www/anketa
cd /var/www/anketa
git clone https://github.com/ВАШ_РЕПО/проект.git .
nano .env
```

В `.env`: `NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

### Шаг 3. Запуск без prod-переопределения (порт 3000 снаружи)

```bash
docker compose up --build -d
```

### Шаг 4. Проверка

Откройте в браузере: `http://IP_СЕРВЕРА:3000`.

**Важно:** в продакшене с доменом используйте вариант 1 с Nginx и HTTPS. Вариант 3 — только для отладки по IP.

---

## Краткая сводка

| Действие | Вариант 1 (Docker) | Вариант 2 (PM2) | Вариант 3 (Docker, тест) |
|----------|--------------------|-----------------|---------------------------|
| Запуск | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` | `pm2 start src/index.js --name anketa` | `docker compose up -d` |
| Обновление | `git pull` + `docker compose ... up --build -d` | `git pull`, сборка client, `pm2 restart anketa` | `git pull` + `docker compose up --build -d` |
| HTTPS | Nginx + Certbot | Nginx + Certbot | Нет |
| Доступ | `https://домен` | `https://домен` | `http://IP:3000` |

Подробности по варианту 1 (включая отладку по HTTP) — в файле [DEPLOY.md](./DEPLOY.md).
