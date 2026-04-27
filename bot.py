import telebot



from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton



import json



import os



import urllib.request



TOKEN = os.getenv("BOT_TOKEN")



bot = telebot.TeleBot(TOKEN)







DATA_FILE = "users.json"







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



@@ -208,50 +208,64 @@ def make_main_keyboard(user):
 
     kb = InlineKeyboardMarkup()
 
 
 
     kb.add(InlineKeyboardButton(f"👆 Кликнуть (+{user['per_click']})", callback_data="click"))
 
 
 
     kb.add(InlineKeyboardButton("🛒 Улучшения", callback_data="shop"))
 
 
 
     kb.add(InlineKeyboardButton("📊 Статистика", callback_data="stats"))
 
 
 
     return kb
 
 
 
 
 
 
 
+def admin_keyboard():
+
+    kb = InlineKeyboardMarkup()
+
+    kb.add(InlineKeyboardButton("♻️ Сбросить игрока", callback_data="admin_reset"))
+
+    kb.add(InlineKeyboardButton("💰 Выдать монеты", callback_data="admin_add"))
+
+    kb.add(InlineKeyboardButton("📊 Статистика игрока", callback_data="admin_stats"))
+
+    return kb
+
+
+
 def get_status_text(user):
 
 
 
     phrase = DMITRIY_PHRASES["click"][user["coins"] // 100 % len(DMITRIY_PHRASES["click"])]
 
 
 
     return (
 
 
 
         f"🧔 Дмитрий говорит: *{phrase}*\n\n"
 
 
 
         f"💰 Монеты: *{user['coins']}*\n"
 
 
 
         f"👆 За клик: *{user['per_click']}*\n"
 
 
 
         f"⚙️ Авто-клик: *{user['auto']}/сек*"
@@ -786,50 +800,80 @@ def handle_back(call):
 
 
 
     except:
 
 
 
         pass
 
 
 
 
 
 
 
 @bot.callback_query_handler(func=lambda call: call.data == "noop")
 def handle_noop(call):
     bot.answer_callback_query(call.id, "Уже куплено!")
 
 
 
 
 
 
 
+@bot.message_handler(commands=['admin'])
+def admin_panel(message):
+    if message.from_user.id != ADMIN_ID:
+        return
+
+    bot.send_message(
+        message.chat.id,
+        "🛠 Админ-панель:",
+        reply_markup=admin_keyboard()
+    )
+
+
+@bot.callback_query_handler(func=lambda call: call.data.startswith("admin_"))
+def admin_menu(call):
+    if call.from_user.id != ADMIN_ID:
+        bot.answer_callback_query(call.id, "Нет доступа")
+        return
+
+    if call.data == "admin_reset":
+        bot.send_message(call.message.chat.id, "Введите: /reset USER_ID")
+
+    if call.data == "admin_add":
+        bot.send_message(call.message.chat.id, "Введите: /addcoins USER_ID AMOUNT")
+
+    if call.data == "admin_stats":
+        bot.send_message(call.message.chat.id, "Введите: /stats USER_ID")
+
+    bot.answer_callback_query(call.id)
+
+
 SUPABASE_URL = "https://vaxqqmlzynbfeuyhptlg.supabase.co"
 SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZheHFxbWx6eW5iZmV1eWhwdGxnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzIxODk1NywiZXhwIjoyMDkyNzk0OTU3fQ.0q-KZliAIH0pkm2qqdSFZEPdec3VkBEsifJ9NRNNY00"
 ADMIN_ID = 1995678658
 
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
        bot.reply_to(message, f"✅ Прогресс {user_id} сброшен в Supabase!")
    except Exception as e:
        bot.reply_to(message, f"❌ Ошибка Supabase: {e}")

print("Бот запускается...")
bot.polling(none_stop=True)
