# 🏋️ Training Booking Bot

Telegram bot for booking workouts with training sessions tracking. All data is stored in Supabase, everything works via buttons — no free text input required.

---

## ✨ Features

| Function | Description |
|---------|----------|
| 📅 Booking | Choose a trainer → date → time. The remaining session count is checked automatically. |
| ❌ Cancellation | If canceled 24+ hours before the session, the workout is returned to the subscription. |
| 💪 Subscription | Check how many workouts you have left at any time. |
| 📢 Admin | The bot sends a notification to the admin on every booking or cancellation. |
| 🗄️ Supabase | All data is stored in the cloud and persists across bot restarts. |

---

## 🛠️ Technologies

- **Node.js** + **Telegraf** — Telegram Bot API
- **Supabase** (PostgreSQL) — база данных
- **JavaScript** (ES Modules)


## 🚀 Getting Started

### 1. Clone the repository

git clone https://github.com/ваш_username/training-booking-bot.git
cd training-booking-bot

### 2. Install dependencies

npm install

### 3. Create a .env file

BOT_TOKEN=your_bot_token_from_BotFather
ADMIN_ID=your_telegram_id
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

### 4. Start the bot

npm start

## 📬 Bot Commands

/start — main menu
/my — remaining workouts

## 🗄️ Database Structure (Supabase)

users — users and remaining workout sessions
trainers — list of trainers
schedule — schedule (date, time, number of slots)
bookings — client bookings
