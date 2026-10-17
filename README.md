# NovelCraft — Telegram Mini App

## 1. Supabase
Создайте проект → SQL Editor → выполните `supabase.sql`.
Ключ `service_role` (Settings → API) используется только на сервере (Vercel env), в браузер не попадает.

## 2. Бот
@BotFather → `/newbot` → получите токен и username.
Затем `/newapp` (или Bot Settings → Menu Button) и укажите URL деплоя на Vercel.

## 3. Vercel → Environment Variables
| Переменная | Значение |
|---|---|
| BOT_TOKEN | токен от BotFather |
| BOT_USERNAME | username бота без @ |
| SUPABASE_URL | https://xxxx.supabase.co |
| SUPABASE_SERVICE_ROLE_KEY | service_role ключ |
| APP_URL | https://ваш-проект.vercel.app |
| WEBHOOK_SECRET | любая случайная строка (для /start) |

Деплой: `vercel --prod` (или импорт из GitHub, Framework: Other).

## 4. Вебхук для /start (по желанию)
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" -d "url=<APP_URL>/api/bot" -d "secret_token=<WEBHOOK_SECRET>"

## Как это работает
- Клиент отправляет `Telegram.WebApp.initData` в заголовке `Authorization: tma ...`.
- `api/_lib.js` проверяет HMAC-подпись по токену бота, берёт `user.id` из подписанных данных.
- Все запросы к Supabase идут с сервера и всегда фильтруются по `tg_id` пользователя.
- Открытие из обычного браузера показывает экран с кнопкой «Открыть в Telegram».
