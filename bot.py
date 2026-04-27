import telebot
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
import json
import os
import urllib.request

TOKEN = os.getenv("BOT_TOKEN")
bot = telebot.TeleBot(TOKEN)

DATA_FILE = "users.json"

SUPABASE_URL = "https://vaxqqmlzynbfeuyhptlg.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZheHFxbWx6eW5iZmV1eWhwdGxnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzIxODk1NywiZXhwIjoyMDkyNzk0OTU3fQ.0q-KZliAIH0pkm2qqdSFZEPdec3VkBEsifJ9NRNNY00"
ADMIN_ID = 1995678658

UPGRADES = {
    "auto1": {"name": "☕ Кофе для Дмитрия", "desc": "+1 авто-клик/сек", "cost": 50, "auto": 1, "multi": 0, "rarity": "Common"},
    "auto2": {"name": "💻 Ноутбук", "desc": "+5 авто-клик/сек", "cost": 300, "auto": 5, "multi": 0, "rarity": "Rare"},
    "multi1": {"name": "🧠 Мозг Дмитрия", "desc": "x2 за клик", "cost": 200, "auto": 0, "multi": 1, "rarity": "Rare"},
    "auto3": {"name": "🤖 Робот-помощник", "desc": "+20 авто-клик/сек", "cost": 1000, "auto": 20, "multi": 0, "rarity": "Epic"},
    "multi2": {"name": "⚡ Суперсила", "desc": "x5 за клик", "cost": 2000, "auto": 0, "multi": 4, "rarity": "Epic"},
    "auto4": {"name": "🏭 Завод Дмитрия", "desc": "+100 авто-клик/сек", "cost": 10000, "auto": 100, "multi": 0, "rarity": "Legendary"},
    "multi3": {"name": "👑 Корона Дмитрия", "desc": "x10 за клик", "cost": 15000, "auto": 0, "multi": 9, "rarity": "Legendary"},
}

RARITY_EMOJI = {
    "Common": "⚪",
    "Rare": "🔵",
    "Epic": "🟣",
    "Legendary": "🟡"
}

DMITRIY_PHRASES = {
    "start": "Привет! Я Дмитрий. Начнём кликать? 💪",
    "click": ["Так держать!", "Хорошая работа!", "Дмитрий доволен!", "Кликай быстрее!", "Неплохо..."],
    "upgrade": "Дмитрий одобряет это улучшение! 👍",
    "milestone_100": "100 монет! Дмитрий гордится тобой! 🎉",
    "milestone_1000": "1000 монет! Дмитрий в шоке! 🤯",
    "milestone_10000": "10000 монет! Дмитрий преклоняется! 👑",
}


# ─── Утилиты ────────────────────────────────────────────────────────────────

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r") as f:
            return json.load(f)
    return {}

def save_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f)

def get_user(data, user_id):
    uid = str(user_id)
    if uid not in data:
        data[uid] = {"coins": 0, "per_click": 1, "auto": 0, "upgrades": []}
    return data[uid]

def make_main_keyboard(user):
    kb = InlineKeyboardMarkup()
    kb.add(InlineKeyboardButton(f"👆 Кликнуть (+{user['per_click']})", callback_data="click"))
    kb.add(InlineKeyboardButton("🛒 Улучшения", callback_data="shop"))
    kb.add(InlineKeyboardButton("📊 Статистика", callback_data="stats"))
    return kb

def admin_keyboard():
    kb = InlineKeyboardMarkup()
    kb.add(InlineKeyboardButton("♻️ Сбросить игрока", callback_data="admin_reset"))
    kb.add(InlineKeyboardButton("💰 Выдать монеты", callback_data="admin_add"))
    kb.add(InlineKeyboardButton("📊 Статистика игрока", callback_data="admin_stats"))
    return kb

def get_status_text(user):
    phrase = DMITRIY_PHRASES["click"][user["coins"] // 100 % len(DMITRIY_PHRASES["click"])]
    return (
        f"🧔 Дмитрий говорит: *{phrase}*\n\n"
        f"💰 Монеты: *{user['coins']}*\n"
        f"👆 За клик: *{user['per_click']}*\n"
        f"⚙️ Авто-клик: *{user['auto']}/сек*"
    )


# ─── Основные хендлеры ──────────────────────────────────────────────────────

@bot.message_handler(commands=['start'])
def start(message):
    kb = InlineKeyboardMarkup()
    kb.add(InlineKeyboardButton(
        "🎮 Играть",
        web_app=WebAppInfo(url="https://molo4ko2914.github.io/dmitriy-clicker")
    ))
    bot.send_message(
        message.chat.id,
        "🧔 *Дмитрий говорит:* Нажми кнопку и начнём кликать! 💪",
        parse_mode="Markdown",
        reply_markup=kb
    )

@bot.callback_query_handler(func=lambda call: call.data == "click")
def handle_click(call):
    bot.answer_callback_query(call.id)
    data = load_data()
    user = get_user(data, call.from_user.id)
    user["coins"] += user["per_click"]

    extra = ""
    for threshold, key in [(10000, "milestone_10000"), (1000, "milestone_1000"), (100, "milestone_100")]:
        if user["coins"] >= threshold and user["coins"] - user["per_click"] < threshold:
            extra = f"\n\n🎉 {DMITRIY_PHRASES[key]}"

    save_data(data)
    try:
        bot.edit_message_text(
            get_status_text(user) + extra,
            call.message.chat.id,
            call.message.message_id,
            parse_mode="Markdown",
            reply_markup=make_main_keyboard(user)
        )
    except:
        pass

@bot.callback_query_handler(func=lambda call: call.data == "shop")
def handle_shop(call):
    bot.answer_callback_query(call.id)
    data = load_data()
    user = get_user(data, call.from_user.id)

    kb = InlineKeyboardMarkup()
    for uid, upg in UPGRADES.items():
        if uid in user["upgrades"]:
            kb.add(InlineKeyboardButton(f"✅ {upg['name']} (куплено)", callback_data="noop"))
        else:
            emoji = RARITY_EMOJI[upg["rarity"]]
            kb.add(InlineKeyboardButton(
                f"{emoji} {upg['name']} — {upg['cost']}💰",
                callback_data=f"buy_{uid}"
            ))
    kb.add(InlineKeyboardButton("🔙 Назад", callback_data="back"))

    try:
        bot.edit_message_text(
            f"🛒 *Магазин улучшений*\n\n💰 У тебя: *{user['coins']}* монет\n\n"
            f"⚪ Common  🔵 Rare  🟣 Epic  🟡 Legendary",
            call.message.chat.id,
            call.message.message_id,
            parse_mode="Markdown",
            reply_markup=kb
        )
    except:
        pass

@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_buy(call):
    data = load_data()
    user = get_user(data, call.from_user.id)
    uid = call.data.replace("buy_", "")
    upg = UPGRADES.get(uid)

    if not upg:
        return
    if user["coins"] < upg["cost"]:
        bot.answer_callback_query(call.id, "😢 Дмитрий говорит: не хватает монет!")
        return

    user["coins"] -= upg["cost"]
    user["upgrades"].append(uid)
    user["auto"] += upg["auto"]
    user["per_click"] += upg["multi"]
    save_data(data)
    bot.answer_callback_query(call.id, f"✅ {DMITRIY_PHRASES['upgrade']}")
    handle_shop(call)

@bot.callback_query_handler(func=lambda call: call.data == "stats")
def handle_stats(call):
    bot.answer_callback_query(call.id)
    data = load_data()
    user = get_user(data, call.from_user.id)
    bought = [UPGRADES[u]["name"] for u in user["upgrades"]] or ["Пока ничего"]

    kb = InlineKeyboardMarkup()
    kb.add(InlineKeyboardButton("🔙 Назад", callback_data="back"))

    try:
        bot.edit_message_text(
            f"📊 *Статистика*\n\n"
            f"💰 Монеты: *{user['coins']}*\n"
            f"👆 За клик: *{user['per_click']}*\n"
            f"⚙️ Авто-клик: *{user['auto']}/сек*\n\n"
            f"🛒 Куплено улучшений: *{len(user['upgrades'])}*\n"
            f"{', '.join(bought)}",
            call.message.chat.id,
            call.message.message_id,
            parse_mode="Markdown",
            reply_markup=kb
        )
    except:
        pass

@bot.callback_query_handler(func=lambda call: call.data == "back")
def handle_back(call):
    bot.answer_callback_query(call.id)
    data = load_data()
    user = get_user(data, call.from_user.id)
    try:
        bot.edit_message_text(
            get_status_text(user),
            call.message.chat.id,
            call.message.message_id,
            parse_mode="Markdown",
            reply_markup=make_main_keyboard(user)
        )
    except:
        pass

@bot.callback_query_handler(func=lambda call: call.data == "noop")
def handle_noop(call):
    bot.answer_callback_query(call.id, "Уже куплено!")


# ─── Админ-панель ───────────────────────────────────────────────────────────

@bot.message_handler(commands=['admin'])
def admin_panel(message):
    if message.from_user.id != ADMIN_ID:
        return
    bot.send_message(
        message.chat.id,
        "🛠 Админ-панель:",
        reply_markup=admin_keyboard()
    )

@bot.callback_query_handler(func=lambda call: call.data.startswith("admin_"))
def admin_menu(call):
    if call.from_user.id != ADMIN_ID:
        bot.answer_callback_query(call.id, "Нет доступа")
        return

    if call.data == "admin_reset":
        bot.send_message(call.message.chat.id, "Введите: /reset USER_ID")
    elif call.data == "admin_add":
        bot.send_message(call.message.chat.id, "Введите: /addcoins USER_ID AMOUNT")
    elif call.data == "admin_stats":
        bot.send_message(call.message.chat.id, "Введите: /userstats USER_ID")

    bot.answer_callback_query(call.id)

@bot.message_handler(commands=['reset'])
def reset_user(message):
    if message.from_user.id != ADMIN_ID:
        bot.reply_to(message, f"Твой ID: {message.from_user.id}, нужен: {ADMIN_ID}")
        return

    args = message.text.split(maxsplit=1)
    if len(args) < 2:
        bot.reply_to(message, "Использование: /reset USER_ID")
        return

    user_id = args[1].split('@')[0].strip()
    try:
        user_id = int(user_id)
    except:
        bot.reply_to(message, "❌ USER_ID должен быть числом")
        return

    # Сброс в users.json
    data = load_data()
    uid = str(user_id)
    if uid in data:
        data[uid] = {"coins": 0, "per_click": 1, "auto": 0, "upgrades": []}
        save_data(data)

    # Сброс в Supabase
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/scores?user_id=eq.{user_id}",
        data=json.dumps({"coins": 0, "total_clicks": 0}).encode(),
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        },
        method="PATCH"
    )
    try:
        urllib.request.urlopen(req)
        bot.reply_to(message, f"✅ Прогресс {user_id} сброшен!")
    except Exception as e:
        bot.reply_to(message, f"❌ Ошибка Supabase: {e}")

@bot.message_handler(commands=['addcoins'])
def add_coins(message):
    if message.from_user.id != ADMIN_ID:
        return

    args = message.text.split()
    if len(args) < 3:
        bot.reply_to(message, "Использование: /addcoins USER_ID AMOUNT")
        return

    try:
        user_id = int(args[1])
        amount = int(args[2])
    except:
        bot.reply_to(message, "❌ USER_ID и AMOUNT должны быть числами")
        return

    data = load_data()
    user = get_user(data, user_id)
    user["coins"] += amount
    save_data(data)
    bot.reply_to(message, f"✅ Выдано {amount} монет игроку {user_id}. Итого: {user['coins']}")

@bot.message_handler(commands=['userstats'])
def user_stats(message):
    if message.from_user.id != ADMIN_ID:
        return

    args = message.text.split()
    if len(args) < 2:
        bot.reply_to(message, "Использование: /userstats USER_ID")
        return

    try:
        user_id = int(args[1])
    except:
        bot.reply_to(message, "❌ USER_ID должен быть числом")
        return

    data = load_data()
    uid = str(user_id)
    if uid not in data:
        bot.reply_to(message, f"❌ Игрок {user_id} не найден")
        return

    user = data[uid]
    bought = [UPGRADES[u]["name"] for u in user["upgrades"]] or ["Пока ничего"]
    bot.reply_to(
        message,
        f"📊 Игрок {user_id}:\n"
        f"💰 Монеты: {user['coins']}\n"
        f"👆 За клик: {user['per_click']}\n"
        f"⚙️ Авто-клик: {user['auto']}/сек\n"
        f"🛒 Улучшения: {', '.join(bought)}"
    )


print("Бот запускается...")
bot.polling(none_stop=True)
