# Настройка регистрации (Google, GitHub, email)

Регистрация работает через [Supabase](https://supabase.com). Бесплатного тарифа хватает до 50 000 активных пользователей в месяц. Пока проект не подключён, приложение работает без аккаунтов, а в окне входа показывается подсказка.

## 1. Проект Supabase

1. Зарегистрируйся на supabase.com → **New project**.
2. Открой **Project Settings → API** и скопируй **Project URL** и **anon public key**.
3. В папке проекта скопируй `.env.example` в `.env.local` и вставь эти два значения.
4. Перезапусти `npm run dev`.

## 2. Адреса для перенаправления

**Authentication → URL Configuration**:
- **Site URL**: адрес сайта (для разработки `http://127.0.0.1:5173`).
- **Redirect URLs**: добавь `http://127.0.0.1:5173/**` и адрес боевого сайта.

## 3. Вход по email

Включён по умолчанию (**Authentication → Providers → Email**). Встроенная почта Supabase отправляет всего несколько писем в час. Для реальных пользователей подключи свой SMTP (Resend, Brevo, Postmark) в **Authentication → SMTP Settings**.

## 4. Google

1. [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Credentials → Create credentials → OAuth client ID** → тип **Web application**.
2. В **Authorized redirect URIs** вставь адрес callback из Supabase (**Authentication → Providers → Google**, вид `https://xxxx.supabase.co/auth/v1/callback`).
3. Скопируй Client ID и Client Secret в Supabase → **Providers → Google** → Enable.

## 5. GitHub

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. **Authorization callback URL** — тот же адрес callback из Supabase.
3. Скопируй Client ID и сгенерированный Client Secret в Supabase → **Providers → GitHub** → Enable.

Так же подключаются Discord, Apple, Microsoft, Twitch и другие из списка Supabase. В `auth.js` достаточно добавить кнопку с нужным `provider`.

## Дальше: монетизация

Следующие шаги требуют серверной части (Supabase Edge Functions):
- **ИИ-прокси с квотой.** Ключи провайдеров хранятся на сервере, у бесплатного аккаунта N генераций в день, у Pro больше. Ключи не попадают в браузер, и их нельзя украсть.
- **Пожертвования.** Уже работают: криптокошельки (`VITE_CRYPTO_WALLETS`) и ссылка на страницу донатов (`VITE_DONATE_URL`): Ko-fi, Buy Me a Coffee, GitHub Sponsors и т.п.
- **Оплата подписки (позже).** Stripe, Lemon Squeezy или Paddle. Lemon Squeezy и Paddle — «продавцы от своего имени»: сами считают и платят налоги с продаж. Доступность выплат и возрастные требования зависят от страны. Вебхук оплаты переключает пользователю тариф на Pro.

## Свои домены (mysite.com → опубликованная страница)

Один раз, всё бесплатно (Cloudflare for SaaS: до 100 доменов):

1. Supabase → SQL editor → выполнить `supabase/domains.sql`.
2. Cloudflare → openconstructor.pw → **DNS** → Add record: тип `AAAA`, имя `domains`, адрес `100::`, оранжевое облако включено.
3. Cloudflare → openconstructor.pw → **SSL/TLS → Custom Hostnames** → включить Cloudflare for SaaS → **Fallback Origin** = `domains.openconstructor.pw` → Add.
4. Cloudflare → иконка профиля → **My Profile → API Tokens → Create Token → Custom token**: права `Zone · SSL and Certificates · Edit`, зона `openconstructor.pw`. Скопировать токен.
5. Zone ID — на странице Overview зоны, справа внизу.
6. В папке проекта:
   ```
   npx.cmd wrangler secret put CF_API_TOKEN
   npx.cmd wrangler secret put CF_ZONE_ID
   npm.cmd run deploy
   npm.cmd run deploy:domains
   ```
Дальше пользователь в «опубликовать → 🌐 домен» вводит свой домен и добавляет у регистратора CNAME на `domains.openconstructor.pw`.

## Аналитика посещений (без cookies)

Cloudflare → **Analytics & Logs → Web Analytics → Add a site** → `openconstructor.pw` → вариант **automatic setup** (скрипт встраивается сам, код менять не нужно). Посещения, страницы, страны и устройства появятся в панели через несколько минут. Политика конфиденциальности это уже упоминает.

## Тесты

```
npm.cmd test          # быстрые проверки (разбор ответов ИИ, Markdown, ZIP) — запускаются перед каждым deploy
npm.cmd run test:e2e  # браузерные сценарии с подставным ИИ (нужен Chrome; dev-сервер поднимется сам)
```
