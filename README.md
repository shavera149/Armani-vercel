# ARMANI — версія для Vercel

У цій версії збережено дизайн і додано вхід/вихід через Discord та Supabase.
Сайт у ChatGPT Sites цей архів не змінює. Нова версія ще не опублікована.

## Публікація через GitHub і Vercel

1. Розпакуйте ZIP. Створіть у GitHub репозиторій `armani-family`.
2. Завантажте в корінь репозиторію папку `public`, файл `vercel.json` та цей README.
   Не завантажуйте ZIP як один файл і не вкладайте все у додаткову папку.
3. У Vercel: Add New → Project → імпортуйте репозиторій.
4. Framework Preset: Other. Root Directory: корінь репозиторію.
   Output Directory: public. Команди встановлення й збірки не потрібні.
5. Натисніть Deploy. Скопіюйте основну Production-адресу `https://….vercel.app`.

## Дозволити повернення із Supabase

У Supabase → Authentication → URL Configuration:
- Site URL: ваша Production-адреса Vercel з `/` у кінці.
- Redirect URLs → Add URL: та сама точна адреса з `/` у кінці.
- Збережіть зміни. Не використовуйте випадкову Preview-адресу.

У Discord Developer Portal залишається Redirect:
https://adczgnhrhzrjhxoahshh.supabase.co/auth/v1/callback

В Authentication → Sign In / Providers → Discord мають бути збережені
Client ID і Client Secret. Discord Client Secret ніколи не додавайте в код.

## Перевірка

Відкрийте Production-адресу → Увійти через Discord → авторизуйте застосунок.
Після повернення має з'явитися ім'я профілю та кнопка Вийти.
Перезавантажте сторінку: вхід має зберегтись. Натисніть Вийти.
Перевірте також скасування входу на екрані Discord.

Вхід створює користувача в Supabase Auth. Він не підтверджує членство в
Discord-сервері Armani і не видає права керівництва.
Фото, рейтинг і ручні налаштування залишаються локальним ескізом.
Спільна база, серверна перевірка ролей і правила RLS потребують наступного етапу.

## Файли

- public/index.html — сторінка та наявні інтеракції.
- public/assets/auth.js — Supabase OAuth PKCE, профіль, вихід.
- public/assets/ — стилі, анімації, зображення.
- vercel.json — розміщення статичних файлів та HTTP-заголовки.

У коді лише публічні Supabase URL і publishable key.
Supabase SDK завантажується з esm.sh; для входу потрібен доступ до цього CDN,
Supabase і Discord. Права доступу до майбутніх даних мають контролюватися RLS,
а не приховуванням елементів інтерфейсу.
