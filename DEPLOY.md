# Деплой на облачном сервере (HTTPS в продакшене, HTTP для отладки)

Ниже — пошаговая инструкция по развёртыванию приложения «Анонимное Анкетирование» на VPS/облачном сервере с поддержкой **HTTPS** в продакшене и **HTTP** для локальной отладки.

---

## Схема работы

| Режим        | Доступ           | Как достигается |
|--------------|------------------|------------------|
| **Продакшен** | HTTPS (порт 443) | Nginx принимает HTTPS, проксирует на приложение по HTTP (localhost:3000). Сертификат — Let's Encrypt. |
| **Отладка**   | HTTP (порт 3000) | Запуск приложения без Nginx, только Node.js. Удобно для разработки и проверки на сервере. |

Приложение само по себе всегда слушает HTTP (порт 3000). В продакшене перед ним ставится обратный прокси (Nginx), который принимает HTTPS и отдаёт трафик приложению по HTTP.

---

## Этап 1. Подготовка сервера

1. **Сервер:** любой VPS с Ubuntu 22.04 / Debian 12 (или аналог). Нужны права sudo.

2. **Домен:** укажите A-запись вашего домена на IP сервера. Например: `anketa.example.com` → IP сервера.

3. **Подключение и обновление:**
   ```bash
   ssh root@ВАШ_IP
   apt update && apt upgrade -y
   ```

4. **Установка Docker и Docker Compose:**
   ```bash
   apt install -y ca-certificates curl
   install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   chmod a+r /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
   apt update
   apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```

5. **Установка Nginx и Certbot (для HTTPS):**
   ```bash
   apt install -y nginx certbot python3-certbot-nginx
   ```

---

## Этап 2. Размещение проекта на сервере

1. Установите Git (если ещё нет):
   ```bash
   apt install -y git
   ```

2. Клонируйте репозиторий или загрузите файлы проекта в каталог, например `/var/www/anketa`:
   ```bash
   mkdir -p /var/www/anketa
   cd /var/www/anketa
   # Вариант 1: клонирование
   git clone https://github.com/ВАШ_РЕПО/проект.git .
   # Вариант 2: загрузка через scp/rsync с вашего ПК
   # scp -r ./project/* user@IP:/var/www/anketa/
   ```

3. Создайте файл с переменными окружения для продакшена (в корне проекта или рядом с `docker-compose.yml`):
   ```bash
   nano .env
   ```
   Содержимое:
   ```env
   NODE_ENV=production
   SUPABASE_URL=https://ВАШ_ПРОЕКТ.supabase.co
   SUPABASE_SERVICE_KEY=ваш_service_role_ключ
   ```
   Сохраните и закройте редактор.

---

## Этап 3. Запуск приложения в Docker (HTTP внутри сервера)

Приложение будет слушать порт **3000** по HTTP. В продакшене лучше привязать порт только к localhost, чтобы снаружи был доступ только через Nginx (HTTPS):

```bash
cd /var/www/anketa
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Для отладки по HTTP снаружи (доступ по IP:3000) используйте обычный запуск:

```bash
docker compose up --build -d
```

Проверка:
```bash
curl -s http://127.0.0.1:3000 | head -5
```
Должна вернуться HTML-страница анкеты.

---

## Этап 4. Настройка Nginx и HTTPS (продакшен)

1. **Временно отключите сайт по умолчанию** (чтобы не конфликтовал с вашим доменом):
   ```bash
   rm -f /etc/nginx/sites-enabled/default
   ```

2. **Создайте конфиг виртуального хоста** для вашего домена. Подставьте свой домен вместо `anketa.example.com`:
   ```bash
   nano /etc/nginx/sites-available/anketa
   ```

   Вставьте конфигурацию (см. файл `deploy/nginx-https.conf` в репозитории или ниже):

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

   Сохраните файл.

3. **Включите сайт и проверьте конфигурацию:**
   ```bash
   ln -sf /etc/nginx/sites-available/anketa /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   ```

4. **Получите сертификат Let's Encrypt (HTTPS):**
   ```bash
   certbot --nginx -d anketa.example.com
   ```
   Следуйте подсказкам (email, согласие с условиями). Certbot сам изменит конфиг Nginx, добавив `listen 443 ssl` и пути к сертификатам.

5. **Проверка:** откройте в браузере `https://anketa.example.com` — должна открыться анкета по HTTPS.

6. **Автопродление сертификата** (обычно уже настроено):
   ```bash
   certbot renew --dry-run
   ```

---

## Этап 5. Режим отладки (только HTTP, без Nginx)

Когда нужно проверить работу приложения без HTTPS (например, по IP или локально на сервере):

1. Остановите Nginx или не настраивайте его для этого домена.
2. Запустите приложение в Docker (оно слушает порт 3000):
   ```bash
   cd /var/www/anketa
   docker compose up -d
   ```
3. Откройте в браузере: `http://IP_СЕРВЕРА:3000` или пробросьте порт в `docker-compose.yml` на `0.0.0.0:3000` и откройте `http://IP:3000`.

**Важно:** для отладки по HTTP не используйте домен с уже выданным HTTPS — браузер может принудительно переключать на HTTPS. Используйте IP и порт или отдельный поддомен без SSL.

Чтобы приложение не отдавало статику (как в dev), можно запускать без Docker: на сервере установите Node.js, в `server` задайте `NODE_ENV=development` и запустите `npm run dev` — тогда статика не подключается (удобно, если фронт крутится отдельно).

---

## Краткая сводка

| Действие | Команда / шаг |
|----------|----------------|
| Продакшен (HTTPS) | Домен → Nginx (80/443) → Certbot → прокси на `http://127.0.0.1:3000` → Docker (приложение) |
| Отладка (HTTP) | Запуск только Docker или `npm run dev` в `server`, доступ по `http://IP:3000` |
| Переменные | В продакшене: `NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` в `.env` или в `docker-compose` |
| Обновление | `git pull` (или загрузка файлов), затем `docker compose up --build -d` |

При такой схеме **в продакшене используется HTTPS** (Nginx + Let's Encrypt), **для отладки — HTTP** (прямой доступ к приложению на порту 3000 без прокси).
