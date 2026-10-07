import asyncio
import json
import os
import sqlite3
from datetime import datetime

from pathlib import Path
from dotenv import load_dotenv
from website_sync import WebsiteSync

load_dotenv(Path(__file__).with_name(".env"))

import discord
from discord import app_commands
from discord.ext import commands, tasks

# ============================================================
# НАЛАШТУВАННЯ
# ============================================================
TOKEN = os.getenv("DISCORD_TOKEN", "").strip()
GUILD_ID = 1555649348501770351

CHANNEL_ID = 1555649349604745260          # Канал реєстрацій
ROLE_ID = 1555649348501770352             # Початкова роль після реєстрації
WELCOME_CHANNEL_ID = 1555649349604745260  # Канал привітань / днів народження

DEFAULT_MENU_IMAGE_URL = "https://i.imgur.com/rARThWW.png"

# ============================================================
# 🆕 КАНАЛИ КОНТРАКТНОЇ СИСТЕМИ — ОБОВ'ЯЗКОВО ЗАПОВНИ
# ============================================================
# Сюди бот надсилатиме заявку на контракт з кнопками
# ✅ Затвердити / ❌ Відхилити
CONTRACT_REVIEW_CHANNEL_ID = 1555649350074638426

# Сюди бот копіюватиме скриншот-доказ
SCREENSHOT_ARCHIVE_CHANNEL_ID = 1555649350527361075

# Якщо True — після успішного копіювання в архів бот спробує
# видалити оригінальний скриншот із чату користувача.
DELETE_SOURCE_SCREENSHOT_MESSAGE = True

# Скільки секунд бот чекатиме скриншот після вибору контракту.
SCREENSHOT_TIMEOUT_SECONDS = 180

# ============================================================
# 🔷 RP / РАНГИ
# ============================================================
# min_earned = RP, зароблені САМЕ КОНТРАКТАМИ за весь час.
# rp_balance = поточний баланс. Саме по ньому рахується TOP ARMANI.
# Якщо RP витрачені -> баланс і TOP зменшуються, але auto-rank не падає.
#
# ВАЖЛИВО: role_id=0 заміни на реальні ID ролей Discord.
RANKS = [
    {"level": 1, "name": "Initiate", "min_earned": 0, "role_id": 1555649348501770352},
    {"level": 2, "name": "Noble", "min_earned": 500, "role_id": 1555649348501770353},
    {"level": 3, "name": "Baron", "min_earned": 1500, "role_id": 1555649348501770354},
    {"level": 4, "name": "Viscount", "min_earned": 2500, "role_id": 1555649348501770355},
    {"level": 5, "name": "Count", "min_earned": 3500, "role_id": 1555649348501770356},
    {"level": 6, "name": "Marquis", "min_earned": 5000, "role_id": 1555649348501770357},
    {"level": 7, "name": "Duke", "min_earned": 6000, "role_id": 1555649348501770358},
    {"level": 8, "name": "Prince", "min_earned": 7500, "role_id": 1555649348501770359},
    {"level": 9, "name": "Monarch", "min_earned": 10000, "role_id": 1555649348501770360},
    ]

# 🆕 Мінімальний рівень рангу, який може затверджувати / відхиляти контракти.
# Наприклад 4 = Еліта та Легенда. Адміністратор сервера теж може затверджувати.
CONTRACT_APPROVER_MIN_LEVEL = 7

# ============================================================
# 🆕 КОНТРАКТИ — ДОДАВАЙ / РЕДАГУЙ ЇХ САМЕ ТУТ
# ============================================================
# key      = унікальний короткий ID латиницею, НЕ повторювати
# name     = назва кнопки контракту
# reward_rp = стандартна нагорода при виконанні з кимось
# SOLO автоматично отримає reward_rp * 2
# description = опис контракту
# emoji    = емодзі на кнопці (можна None)
#
# ВАЖЛИВО: Discord дозволяє максимум 25 компонентів у View.
# Рекомендовано тримати до 20-25 контрактів в одному меню.
CONTRACTS = [
    {
        "key": "materials",
        "name": "Доставка матеріалів",
        "reward_rp": 250,
        "description": "Доставити необхідні матеріали у визначене місце та зробити скриншот виконання.",
        "emoji": "📦",
    },
    {
        "key": "escort",
        "name": "Супровід",
        "reward_rp": 350,
        "description": "Виконати супровід цілі / транспорту та надати скриншот-доказ.",
        "emoji": "🛡️",
    },
    {
        "key": "vehicle",
        "name": "Робота з транспортом",
        "reward_rp": 300,
        "description": "Виконати транспортне завдання сім'ї та надати скриншот виконання.",
        "emoji": "🚘",
    },
]

# ============================================================
# DISCORD BOT
# ============================================================
intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix="!", intents=intents)
website_sync = WebsiteSync(bot, GUILD_ID, lambda: get_db_connection())


# ============================================================
# БАЗА ДАНИХ
# ============================================================
def get_db_connection():
    conn = sqlite3.connect(str(Path(__file__).with_name("armani_bot.db")), timeout=10.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER,
            guild_id INTEGER,
            birth_date TEXT DEFAULT NULL,
            rp_balance INTEGER NOT NULL DEFAULT 0,
            contract_rp_earned INTEGER NOT NULL DEFAULT 0,
            rank_level INTEGER NOT NULL DEFAULT 1,
            rank_source TEXT NOT NULL DEFAULT 'auto',
            PRIMARY KEY (user_id, guild_id)
        )
    """)

    migrations = [
        "ALTER TABLE users ADD COLUMN birth_date TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN rp_balance INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN contract_rp_earned INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN rank_level INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE users ADD COLUMN rank_source TEXT NOT NULL DEFAULT 'auto'",
    ]

    for sql in migrations:
        try:
            cursor.execute(sql)
        except sqlite3.OperationalError:
            pass

    # Старі таблиці залишаємо для сумісності з попередньою версією.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS contract_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id INTEGER NOT NULL,
            contract_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            reward_rp INTEGER NOT NULL,
            completed_at TEXT NOT NULL,
            UNIQUE(guild_id, contract_id, user_id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS rp_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            amount INTEGER NOT NULL,
            transaction_type TEXT NOT NULL,
            reason TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )
    """)

    # ========================================================
    # 🆕 ЗАЯВКИ НА КОНТРАКТИ
    # ========================================================
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS contract_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id INTEGER NOT NULL,
            contract_key TEXT NOT NULL,
            contract_name TEXT NOT NULL,
            submitter_id INTEGER NOT NULL,
            mode TEXT NOT NULL,
            participant_ids TEXT NOT NULL,
            base_reward INTEGER NOT NULL,
            reward_each INTEGER NOT NULL,
            screenshot_url TEXT NOT NULL,
            archive_message_id INTEGER DEFAULT NULL,
            review_message_id INTEGER DEFAULT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            reviewer_id INTEGER DEFAULT NULL,
            created_at TEXT NOT NULL,
            reviewed_at TEXT DEFAULT NULL
        )
    """)

    # Окремий журнал затверджених контрактів.
    # На одну заявку може бути декілька нагород — по одній на кожного учасника.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS contract_rewards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id INTEGER NOT NULL,
            submission_id INTEGER NOT NULL,
            contract_key TEXT NOT NULL,
            contract_name TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            reward_rp INTEGER NOT NULL,
            rewarded_at TEXT NOT NULL,
            UNIQUE(submission_id, user_id)
        )
    """)

    conn.commit()
    conn.close()


def ensure_user(user_id: int, guild_id: int):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (user_id, guild_id)
            VALUES (?, ?)
            ON CONFLICT(user_id, guild_id) DO NOTHING
        """, (user_id, guild_id))
        conn.commit()
    finally:
        conn.close()


def delete_user_from_db(user_id: int, guild_id: int):
    """Видалення профілю учасника при виході з сервера."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE user_id = ? AND guild_id = ?", (user_id, guild_id))
        cursor.execute("DELETE FROM contract_history WHERE user_id = ? AND guild_id = ?", (user_id, guild_id))
        cursor.execute("DELETE FROM contract_rewards WHERE user_id = ? AND guild_id = ?", (user_id, guild_id))
        cursor.execute("DELETE FROM rp_transactions WHERE user_id = ? AND guild_id = ?", (user_id, guild_id))
        conn.commit()
    finally:
        conn.close()


def save_birth_date(user_id: int, guild_id: int, birth_date_str: str):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (user_id, guild_id, birth_date)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, guild_id) DO UPDATE SET birth_date = ?
        """, (user_id, guild_id, birth_date_str, birth_date_str))
        conn.commit()
    finally:
        conn.close()


# ============================================================
# RP / РАНГИ / ПРОФІЛЬ / TOP
# ============================================================
def format_rp(value: int) -> str:
    return f"{value:,}".replace(",", " ")


def get_rank_data(level: int):
    for rank in RANKS:
        if rank["level"] == level:
            return rank
    return RANKS[0]


def get_auto_rank_level(contract_rp_earned: int):
    level = 1
    for rank in sorted(RANKS, key=lambda r: r["level"]):
        if contract_rp_earned >= rank["min_earned"]:
            level = rank["level"]
    return level


def get_next_auto_rank(contract_rp_earned: int):
    for rank in sorted(RANKS, key=lambda r: r["min_earned"]):
        if contract_rp_earned < rank["min_earned"]:
            return rank
    return None


def get_top_position(user_id: int, guild_id: int):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT user_id
            FROM users
            WHERE guild_id = ?
            ORDER BY rp_balance DESC, contract_rp_earned DESC, user_id ASC
        """, (guild_id,))
        ids = [row[0] for row in cursor.fetchall()]
        return ids.index(user_id) + 1 if user_id in ids else None
    finally:
        conn.close()


def get_user_stats(user_id: int, guild_id: int):
    ensure_user(user_id, guild_id)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT rp_balance, contract_rp_earned, rank_level, rank_source
            FROM users
            WHERE user_id = ? AND guild_id = ?
        """, (user_id, guild_id))
        row = cursor.fetchone()

        cursor.execute("""
            SELECT COUNT(*)
            FROM contract_rewards
            WHERE user_id = ? AND guild_id = ?
        """, (user_id, guild_id))
        new_completed = cursor.fetchone()[0]

        # Підтягуємо старий лічильник, якщо ти вже користувався попередньою версією.
        cursor.execute("""
            SELECT COUNT(*)
            FROM contract_history
            WHERE user_id = ? AND guild_id = ?
        """, (user_id, guild_id))
        legacy_completed = cursor.fetchone()[0]

        return {
            "rp_balance": row[0],
            "contract_rp_earned": row[1],
            "rank_level": row[2],
            "rank_source": row[3],
            "contracts_completed": new_completed + legacy_completed,
        }
    finally:
        conn.close()


def spend_rp(user_id: int, guild_id: int, amount: int, reason: str):
    if amount <= 0:
        return False, "Сума повинна бути більшою за 0."

    ensure_user(user_id, guild_id)

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT rp_balance FROM users WHERE user_id = ? AND guild_id = ?", (user_id, guild_id))
        row = cursor.fetchone()
        balance = row[0] if row else 0

        if balance < amount:
            return False, f"Недостатньо RP. Баланс: {balance} RP."

        cursor.execute("""
            UPDATE users
            SET rp_balance = rp_balance - ?
            WHERE user_id = ? AND guild_id = ?
        """, (amount, user_id, guild_id))

        cursor.execute("""
            INSERT INTO rp_transactions (
                guild_id, user_id, amount, transaction_type, reason, created_at
            ) VALUES (?, ?, ?, 'spend', ?, ?)
        """, (
            guild_id,
            user_id,
            -amount,
            reason,
            datetime.now().strftime("%d.%m.%Y %H:%M")
        ))

        conn.commit()
        return True, balance - amount
    finally:
        conn.close()


async def set_discord_rank_role(member: discord.Member, target_level: int):
    rank = get_rank_data(target_level)
    role_id = rank["role_id"]

    if not role_id:
        return False, f"Для рангу «{rank['name']}» не вказаний Discord Role ID у RANKS."

    target_role = member.guild.get_role(role_id)
    if not target_role:
        return False, f"Discord-роль для рангу «{rank['name']}» не знайдена."

    configured_rank_ids = {r["role_id"] for r in RANKS if r["role_id"]}
    roles_to_remove = [
        role for role in member.roles
        if role.id in configured_rank_ids and role.id != target_role.id
    ]

    try:
        if roles_to_remove:
            await member.remove_roles(*roles_to_remove, reason="ARMANI rank sync")
        if target_role not in member.roles:
            await member.add_roles(target_role, reason="ARMANI rank sync")
        return True, None
    except discord.Forbidden:
        return False, "Бот не може керувати цією роллю. Підніми роль бота вище рангів і дай Manage Roles."
    except discord.HTTPException as exc:
        return False, f"Discord API error: {exc}"


async def sync_member_rank(member: discord.Member):
    """
    Автоматично ПІДВИЩУЄ ранг тільки за RP, зароблені контрактами.
    Витрата RP не понижує ранг.
    Ручний rank_set не додає RP.
    """
    stats = get_user_stats(member.id, member.guild.id)
    auto_level = get_auto_rank_level(stats["contract_rp_earned"])
    current_level = stats["rank_level"]

    if auto_level <= current_level:
        return False, current_level, None

    ok, error = await set_discord_rank_role(member, auto_level)
    if not ok:
        return False, current_level, error

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users
            SET rank_level = ?, rank_source = 'auto'
            WHERE user_id = ? AND guild_id = ?
        """, (auto_level, member.id, member.guild.id))
        conn.commit()
    finally:
        conn.close()

    return True, auto_level, None


async def send_profile(interaction: discord.Interaction, member: discord.Member):
    stats = get_user_stats(member.id, interaction.guild_id)
    rank = get_rank_data(stats["rank_level"])
    auto_level = get_auto_rank_level(stats["contract_rp_earned"])
    auto_rank = get_rank_data(auto_level)
    next_rank = get_next_auto_rank(stats["contract_rp_earned"])
    top_position = get_top_position(member.id, interaction.guild_id)

    embed = discord.Embed(
        title="🔷 ARMANI PROFILE",
        description=f"Особова картка {member.mention}",
        color=0x1B365D
    )
    embed.set_thumbnail(url=member.display_avatar.url)

    embed.add_field(name="💰 Баланс RP", value=f"**{format_rp(stats['rp_balance'])} RP**", inline=True)
    embed.add_field(name="🏆 TOP ARMANI", value=f"**#{top_position}**" if top_position else "—", inline=True)
    embed.add_field(name="✅ Контрактів", value=f"**{stats['contracts_completed']}**", inline=True)
    embed.add_field(
        name="📄 Зароблено контрактами",
        value=f"**{format_rp(stats['contract_rp_earned'])} RP**",
        inline=True
    )
    embed.add_field(
        name="🎖️ Поточний ранг",
        value=f"**{rank['name']}** · LVL {rank['level']}",
        inline=True
    )
    embed.add_field(
        name="⚙️ Джерело рангу",
        value="`AUTO`" if stats["rank_source"] == "auto" else "`MANUAL`",
        inline=True
    )

    if next_rank:
        needed = next_rank["min_earned"] - stats["contract_rp_earned"]
        embed.add_field(
            name="⬆️ Наступний авто-ранг",
            value=(
                f"**{next_rank['name']}** — ще **{format_rp(needed)} RP**\n"
                f"Поріг: `{format_rp(next_rank['min_earned'])} RP`"
            ),
            inline=False
        )
    else:
        embed.add_field(name="👑 Прогрес", value="Досягнуто максимальний автоматичний ранг.", inline=False)

    if auto_rank["level"] != rank["level"]:
        embed.add_field(
            name="📈 Ранг за контрактним прогресом",
            value=f"**{auto_rank['name']}** · LVL {auto_rank['level']}",
            inline=False
        )

    embed.set_footer(
        text="TOP = поточний баланс RP • Ранг = RP, зароблені контрактами за весь час"
    )
    await interaction.response.send_message(embed=embed, ephemeral=True)


async def send_top(interaction: discord.Interaction):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT user_id, rp_balance, contract_rp_earned
            FROM users
            WHERE guild_id = ?
            ORDER BY rp_balance DESC, contract_rp_earned DESC, user_id ASC
            LIMIT 10
        """, (interaction.guild_id,))
        rows = cursor.fetchall()
    finally:
        conn.close()

    lines = []
    medals = ["🥇", "🥈", "🥉"]

    for index, (user_id, balance, earned) in enumerate(rows, start=1):
        member = interaction.guild.get_member(user_id) if interaction.guild else None
        name = member.mention if member else f"<@{user_id}>"
        prefix = medals[index - 1] if index <= 3 else f"`#{index}`"
        lines.append(
            f"{prefix} {name} — **{format_rp(balance)} RP** "
            f"· зароблено `{format_rp(earned)}`"
        )

    embed = discord.Embed(
        title="🏆 TOP ARMANI",
        description="\n".join(lines) if lines else "Поки що рейтинг порожній.",
        color=0x1B365D
    )
    embed.set_footer(text="TOP рахується по поточному балансу. Витратив RP — позиція може змінитися.")
    await interaction.response.send_message(embed=embed, ephemeral=True)


# ============================================================
# 🆕 КОНТРАКТНА СИСТЕМА
# ============================================================
def get_contract(contract_key: str):
    for contract in CONTRACTS:
        if contract["key"] == contract_key:
            return contract
    return None


def member_can_approve_contracts(member: discord.Member) -> bool:
    if member.guild_permissions.administrator:
        return True

    configured = {
        rank["role_id"]: rank["level"]
        for rank in RANKS
        if rank["role_id"]
    }

    highest_level = 0
    for role in member.roles:
        if role.id in configured:
            highest_level = max(highest_level, configured[role.id])

    return highest_level >= CONTRACT_APPROVER_MIN_LEVEL


def create_submission(
    guild_id: int,
    contract: dict,
    submitter_id: int,
    mode: str,
    participant_ids: list[int],
    reward_each: int,
    screenshot_url: str,
    archive_message_id: int | None,
):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO contract_submissions (
                guild_id,
                contract_key,
                contract_name,
                submitter_id,
                mode,
                participant_ids,
                base_reward,
                reward_each,
                screenshot_url,
                archive_message_id,
                status,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        """, (
            guild_id,
            contract["key"],
            contract["name"],
            submitter_id,
            mode,
            json.dumps(participant_ids),
            contract["reward_rp"],
            reward_each,
            screenshot_url,
            archive_message_id,
            datetime.now().strftime("%d.%m.%Y %H:%M")
        ))
        submission_id = cursor.lastrowid
        conn.commit()
        return submission_id
    finally:
        conn.close()


def set_submission_review_message(submission_id: int, message_id: int):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE contract_submissions
            SET review_message_id = ?
            WHERE id = ?
        """, (message_id, submission_id))
        conn.commit()
    finally:
        conn.close()


def get_submission(submission_id: int):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                id,
                guild_id,
                contract_key,
                contract_name,
                submitter_id,
                mode,
                participant_ids,
                base_reward,
                reward_each,
                screenshot_url,
                archive_message_id,
                review_message_id,
                status,
                reviewer_id,
                created_at,
                reviewed_at
            FROM contract_submissions
            WHERE id = ?
        """, (submission_id,))
        row = cursor.fetchone()

        if not row:
            return None

        return {
            "id": row[0],
            "guild_id": row[1],
            "contract_key": row[2],
            "contract_name": row[3],
            "submitter_id": row[4],
            "mode": row[5],
            "participant_ids": json.loads(row[6]),
            "base_reward": row[7],
            "reward_each": row[8],
            "screenshot_url": row[9],
            "archive_message_id": row[10],
            "review_message_id": row[11],
            "status": row[12],
            "reviewer_id": row[13],
            "created_at": row[14],
            "reviewed_at": row[15],
        }
    finally:
        conn.close()


def get_pending_submission_ids():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM contract_submissions WHERE status = 'pending'")
        return [row[0] for row in cursor.fetchall()]
    finally:
        conn.close()


def approve_submission(submission_id: int, reviewer_id: int):
    """Атомарно нараховує RP всім учасникам заявки один раз."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("BEGIN IMMEDIATE")

        cursor.execute("""
            SELECT guild_id, contract_key, contract_name, participant_ids, reward_each, status
            FROM contract_submissions
            WHERE id = ?
        """, (submission_id,))
        row = cursor.fetchone()

        if not row:
            conn.rollback()
            return False, "Заявку не знайдено."

        guild_id, contract_key, contract_name, participant_ids_json, reward_each, status = row

        if status != "pending":
            conn.rollback()
            return False, f"Ця заявка вже має статус: {status}."

        participant_ids = json.loads(participant_ids_json)
        now = datetime.now().strftime("%d.%m.%Y %H:%M")
        awarded = []

        for user_id in participant_ids:
            cursor.execute("""
                INSERT INTO users (user_id, guild_id)
                VALUES (?, ?)
                ON CONFLICT(user_id, guild_id) DO NOTHING
            """, (user_id, guild_id))

            cursor.execute("""
                UPDATE users
                SET rp_balance = rp_balance + ?,
                    contract_rp_earned = contract_rp_earned + ?
                WHERE user_id = ? AND guild_id = ?
            """, (reward_each, reward_each, user_id, guild_id))

            cursor.execute("""
                INSERT INTO contract_rewards (
                    guild_id,
                    submission_id,
                    contract_key,
                    contract_name,
                    user_id,
                    reward_rp,
                    rewarded_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                guild_id,
                submission_id,
                contract_key,
                contract_name,
                user_id,
                reward_each,
                now
            ))

            cursor.execute("""
                INSERT INTO rp_transactions (
                    guild_id,
                    user_id,
                    amount,
                    transaction_type,
                    reason,
                    created_at
                ) VALUES (?, ?, ?, 'contract', ?, ?)
            """, (
                guild_id,
                user_id,
                reward_each,
                f"Контракт: {contract_name} • заявка #{submission_id}",
                now
            ))

            awarded.append(user_id)

        cursor.execute("""
            UPDATE contract_submissions
            SET status = 'approved', reviewer_id = ?, reviewed_at = ?
            WHERE id = ?
        """, (reviewer_id, now, submission_id))

        conn.commit()
        return True, {
            "guild_id": guild_id,
            "contract_name": contract_name,
            "participant_ids": awarded,
            "reward_each": reward_each,
        }

    except sqlite3.IntegrityError:
        conn.rollback()
        return False, "RP за цю заявку вже були нараховані."
    finally:
        conn.close()


def reject_submission(submission_id: int, reviewer_id: int):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("BEGIN IMMEDIATE")
        cursor.execute("SELECT status FROM contract_submissions WHERE id = ?", (submission_id,))
        row = cursor.fetchone()

        if not row:
            conn.rollback()
            return False, "Заявку не знайдено."

        if row[0] != "pending":
            conn.rollback()
            return False, f"Ця заявка вже має статус: {row[0]}."

        cursor.execute("""
            UPDATE contract_submissions
            SET status = 'rejected', reviewer_id = ?, reviewed_at = ?
            WHERE id = ?
        """, (
            reviewer_id,
            datetime.now().strftime("%d.%m.%Y %H:%M"),
            submission_id
        ))
        conn.commit()
        return True, None
    finally:
        conn.close()


def is_image_attachment(attachment: discord.Attachment) -> bool:
    if attachment.content_type and attachment.content_type.startswith("image/"):
        return True
    ext = os.path.splitext(attachment.filename.lower())[1]
    return ext in {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def participant_mentions(participant_ids: list[int]) -> str:
    return "\n".join(f"• <@{uid}>" for uid in participant_ids)


async def request_contract_screenshot(
    interaction: discord.Interaction,
    contract: dict,
    mode: str,
    extra_member_ids: list[int] | None = None,
):
    if not interaction.guild or not interaction.channel:
        await interaction.response.send_message("❌ Контракт можна здати тільки на сервері.", ephemeral=True)
        return

    if not CONTRACT_REVIEW_CHANNEL_ID or not SCREENSHOT_ARCHIVE_CHANNEL_ID:
        await interaction.response.send_message(
            "❌ Адміністратор ще не вказав CONTRACT_REVIEW_CHANNEL_ID або SCREENSHOT_ARCHIVE_CHANNEL_ID у коді.",
            ephemeral=True
        )
        return

    extra_member_ids = extra_member_ids or []
    participant_ids = [interaction.user.id]

    for user_id in extra_member_ids:
        if user_id not in participant_ids:
            participant_ids.append(user_id)

    reward_each = contract["reward_rp"] * 2 if mode == "solo" else contract["reward_rp"]

    mode_text = "СОЛО ×2" if mode == "solo" else "З КОМАНДОЮ ×1"

    await interaction.response.send_message(
        (
            f"📸 **{contract['name']}** • `{mode_text}`\n\n"
            f"Тепер надішли **1 скриншот-доказ у цей канал** протягом "
            f"**{SCREENSHOT_TIMEOUT_SECONDS} секунд**.\n"
            "Бот сам забере картинку, скопіює її в архів і створить заявку на перевірку."
        ),
        ephemeral=True
    )

    def check(message: discord.Message):
        if message.author.id != interaction.user.id:
            return False
        if message.channel.id != interaction.channel.id:
            return False
        return any(is_image_attachment(att) for att in message.attachments)

    try:
        message = await bot.wait_for("message", timeout=SCREENSHOT_TIMEOUT_SECONDS, check=check)
    except asyncio.TimeoutError:
        await interaction.followup.send(
            "⌛ Час вийшов. Відкрий **Контракти** та почни подачу ще раз.",
            ephemeral=True
        )
        return

    attachment = next(att for att in message.attachments if is_image_attachment(att))

    archive_channel = interaction.guild.get_channel(SCREENSHOT_ARCHIVE_CHANNEL_ID)
    review_channel = interaction.guild.get_channel(CONTRACT_REVIEW_CHANNEL_ID)

    if archive_channel is None or not isinstance(archive_channel, discord.TextChannel):
        await interaction.followup.send("❌ Канал скриншотів-архіву не знайдено.", ephemeral=True)
        return

    if review_channel is None or not isinstance(review_channel, discord.TextChannel):
        await interaction.followup.send("❌ Канал контрактів для перевірки не знайдено.", ephemeral=True)
        return

    try:
        archive_file = await attachment.to_file()
        archive_embed = discord.Embed(
            title="📸 ARMANI • SCREENSHOT ARCHIVE",
            description=(
                f"**Контракт:** {contract['name']}\n"
                f"**Автор:** {interaction.user.mention}\n"
                f"**Режим:** `{mode_text}`\n"
                f"**Учасників:** `{len(participant_ids)}`"
            ),
            color=0x1B365D
        )
        archive_message = await archive_channel.send(embed=archive_embed, file=archive_file)
    except (discord.Forbidden, discord.HTTPException) as exc:
        await interaction.followup.send(f"❌ Не вдалося зберегти скриншот в архів: `{exc}`", ephemeral=True)
        return

    if not archive_message.attachments:
        await interaction.followup.send("❌ Discord не повернув збережений файл з архіву.", ephemeral=True)
        return

    screenshot_url = archive_message.attachments[0].url

    # Видаляємо оригінальний скриншот із каналу користувача ПІСЛЯ того,
    # як Discord уже успішно зберіг копію в архіві.
    if DELETE_SOURCE_SCREENSHOT_MESSAGE:
        try:
            await message.delete()
        except discord.Forbidden:
            await interaction.followup.send(
                "⚠️ Скриншот збережено в архіві, але я не зміг видалити "
                "оригінальне повідомлення. Дай боту право **Manage Messages / Керування повідомленнями**.",
                ephemeral=True
            )
        except discord.HTTPException as exc:
            print(f"Не вдалося видалити оригінальний скриншот: {exc}")

    submission_id = create_submission(
        guild_id=interaction.guild.id,
        contract=contract,
        submitter_id=interaction.user.id,
        mode=mode,
        participant_ids=participant_ids,
        reward_each=reward_each,
        screenshot_url=screenshot_url,
        archive_message_id=archive_message.id,
    )

    review_embed = discord.Embed(
        title=f"📄 КОНТРАКТ #{submission_id} • НА ПЕРЕВІРЦІ",
        description=f"**{contract['name']}**\n{contract['description']}",
        color=0xF1C40F
    )
    review_embed.add_field(name="👤 Подав", value=interaction.user.mention, inline=True)
    review_embed.add_field(name="⚙️ Режим", value=f"`{mode_text}`", inline=True)
    review_embed.add_field(name="💰 RP кожному", value=f"`{reward_each} RP`", inline=True)
    review_embed.add_field(
        name="👥 Учасники",
        value=participant_mentions(participant_ids),
        inline=False
    )
    review_embed.add_field(
        name="📸 Архів",
        value=f"[Відкрити повідомлення зі скриншотом]({archive_message.jump_url})",
        inline=False
    )
    review_embed.set_image(url=screenshot_url)
    review_embed.set_footer(
        text=f"Затвердження: ранг LVL {CONTRACT_APPROVER_MIN_LEVEL}+ або Administrator"
    )

    review_view = ContractApprovalView(submission_id)
    review_message = await review_channel.send(embed=review_embed, view=review_view)
    set_submission_review_message(submission_id, review_message.id)

    await interaction.followup.send(
        f"✅ Контракт **{contract['name']}** відправлено на перевірку. Номер заявки: `#{submission_id}`.",
        ephemeral=True
    )


# ============================================================
# 🆕 DISCORD UI: КОНТРАКТИ
# ============================================================
class ContractButton(discord.ui.Button):
    def __init__(self, contract: dict, row: int):
        super().__init__(
            label=contract["name"][:80],
            emoji=contract.get("emoji"),
            style=discord.ButtonStyle.primary,
            row=row,
            custom_id=f"contract_pick:{contract['key']}"
        )
        self.contract = contract

    async def callback(self, interaction: discord.Interaction):
        contract = self.contract
        embed = discord.Embed(
            title=f"{contract.get('emoji') or '📄'} {contract['name']}",
            description=contract["description"],
            color=0x1B365D
        )
        embed.add_field(
            name="💰 Стандартна нагорода",
            value=f"`{format_rp(contract['reward_rp'])} RP` кожному",
            inline=True
        )
        embed.add_field(
            name="🔥 Соло",
            value=f"`{format_rp(contract['reward_rp'] * 2)} RP`",
            inline=True
        )
        embed.add_field(
            name="👥 З кимось",
            value=f"`{format_rp(contract['reward_rp'])} RP` кожному учаснику",
            inline=True
        )
        embed.set_footer(text="Оберіть спосіб виконання")
        await interaction.response.send_message(
            embed=embed,
            view=ContractModeView(contract),
            ephemeral=True
        )


class ContractListView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=180)
        for index, contract in enumerate(CONTRACTS[:25]):
            self.add_item(ContractButton(contract, row=index // 5))


class ContractModeView(discord.ui.View):
    def __init__(self, contract: dict):
        super().__init__(timeout=180)
        self.contract = contract

    @discord.ui.button(label="🔥 Виконав соло ×2", style=discord.ButtonStyle.success)
    async def solo_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await request_contract_screenshot(
            interaction=interaction,
            contract=self.contract,
            mode="solo",
            extra_member_ids=[]
        )
        self.stop()

    @discord.ui.button(label="👥 Виконано з кимось", style=discord.ButtonStyle.secondary)
    async def group_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        embed = discord.Embed(
            title="👥 Учасники контракту",
            description=(
                "Вибери людей, **з якими ти виконував контракт**.\n"
                "Тебе бот додасть до списку автоматично.\n\n"
                "Після вибору бот попросить скриншот."
            ),
            color=0x1B365D
        )
        await interaction.response.send_message(
            embed=embed,
            view=ContractParticipantsView(self.contract, interaction.user.id),
            ephemeral=True
        )
        self.stop()


class ContractMemberSelect(discord.ui.UserSelect):
    def __init__(self, contract: dict, owner_id: int):
        super().__init__(
            placeholder="Вибери учасників контракту...",
            min_values=1,
            max_values=20,
            custom_id=f"contract_members:{contract['key']}"
        )
        self.contract = contract
        self.owner_id = owner_id

    async def callback(self, interaction: discord.Interaction):
        if interaction.user.id != self.owner_id:
            await interaction.response.send_message("❌ Це меню відкрив інший користувач.", ephemeral=True)
            return

        selected_ids = []
        skipped = []

        for selected in self.values:
            member = interaction.guild.get_member(selected.id) if interaction.guild else None

            if not member:
                skipped.append(selected.id)
                continue
            if member.bot:
                skipped.append(selected.id)
                continue
            if member.id == interaction.user.id:
                continue

            if member.id not in selected_ids:
                selected_ids.append(member.id)

        if not selected_ids:
            await interaction.response.send_message(
                "❌ Вибери хоча б одного іншого учасника сім'ї.",
                ephemeral=True
            )
            return

        await request_contract_screenshot(
            interaction=interaction,
            contract=self.contract,
            mode="group",
            extra_member_ids=selected_ids
        )
        self.view.stop()


class ContractParticipantsView(discord.ui.View):
    def __init__(self, contract: dict, owner_id: int):
        super().__init__(timeout=180)
        self.add_item(ContractMemberSelect(contract, owner_id))


class ContractApprovalView(discord.ui.View):
    def __init__(self, submission_id: int, disabled: bool = False):
        super().__init__(timeout=None)
        self.submission_id = submission_id

        approve_button = discord.ui.Button(
            label="Затвердити",
            emoji="✅",
            style=discord.ButtonStyle.success,
            custom_id=f"contract_approve:{submission_id}",
            disabled=disabled
        )
        reject_button = discord.ui.Button(
            label="Відхилити",
            emoji="❌",
            style=discord.ButtonStyle.danger,
            custom_id=f"contract_reject:{submission_id}",
            disabled=disabled
        )

        approve_button.callback = self.approve_callback
        reject_button.callback = self.reject_callback

        self.add_item(approve_button)
        self.add_item(reject_button)

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if not isinstance(interaction.user, discord.Member):
            await interaction.response.send_message("❌ Не вдалося перевірити ваш ранг.", ephemeral=True)
            return False

        if not member_can_approve_contracts(interaction.user):
            min_rank = get_rank_data(CONTRACT_APPROVER_MIN_LEVEL)
            await interaction.response.send_message(
                f"🔒 Затверджувати контракти може **{min_rank['name']} (LVL {CONTRACT_APPROVER_MIN_LEVEL})** і вище.",
                ephemeral=True
            )
            return False

        return True

    async def approve_callback(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)

        success, result = approve_submission(self.submission_id, interaction.user.id)
        if not success:
            await interaction.followup.send(f"❌ {result}", ephemeral=True)
            return

        guild = interaction.guild
        promotion_lines = []
        error_lines = []

        if guild:
            for user_id in result["participant_ids"]:
                member = guild.get_member(user_id)
                if not member:
                    continue

                promoted, new_level, error = await sync_member_rank(member)
                if promoted:
                    promotion_lines.append(
                        f"• {member.mention} → **{get_rank_data(new_level)['name']}** · LVL {new_level}"
                    )
                elif error:
                    error_lines.append(f"• {member.mention}: {error}")

        embed = interaction.message.embeds[0].copy() if interaction.message.embeds else discord.Embed()
        embed.title = f"✅ КОНТРАКТ #{self.submission_id} • ЗАТВЕРДЖЕНО"
        embed.color = 0x2ECC71
        embed.add_field(
            name="✅ Затвердив",
            value=interaction.user.mention,
            inline=True
        )
        embed.add_field(
            name="💰 Нараховано",
            value=f"`+{format_rp(result['reward_each'])} RP` кожному учаснику",
            inline=True
        )

        if promotion_lines:
            embed.add_field(
                name="🎖️ Автоматичне підвищення",
                value="\n".join(promotion_lines),
                inline=False
            )

        if error_lines:
            embed.add_field(
                name="⚠️ RP нараховано, але були проблеми з ролями",
                value="\n".join(error_lines)[:1024],
                inline=False
            )

        embed.set_footer(text="ARMANI • CONTRACT APPROVED")
        await interaction.message.edit(embed=embed, view=ContractApprovalView(self.submission_id, disabled=True))
        await interaction.followup.send("✅ Контракт затверджено, RP зараховані у профілі.", ephemeral=True)

    async def reject_callback(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)

        success, error = reject_submission(self.submission_id, interaction.user.id)
        if not success:
            await interaction.followup.send(f"❌ {error}", ephemeral=True)
            return

        embed = interaction.message.embeds[0].copy() if interaction.message.embeds else discord.Embed()
        embed.title = f"❌ КОНТРАКТ #{self.submission_id} • ВІДХИЛЕНО"
        embed.color = 0xE74C3C
        embed.add_field(name="❌ Відхилив", value=interaction.user.mention, inline=False)
        embed.set_footer(text="ARMANI • CONTRACT REJECTED • RP не нараховано")
        await interaction.message.edit(embed=embed, view=ContractApprovalView(self.submission_id, disabled=True))
        await interaction.followup.send("❌ Контракт відхилено. RP не нараховано.", ephemeral=True)


async def send_contract_menu(interaction: discord.Interaction):
    if not CONTRACTS:
        await interaction.response.send_message("Контракти ще не додані в код.", ephemeral=True)
        return

    embed = discord.Embed(
        title="📄 ARMANI CONTRACTS",
        description=(
            "Оберіть контракт кнопкою нижче.\n\n"
            "🔥 **Соло** — нагорода **×2**.\n"
            "👥 **З кимось** — стандартна нагорода **кожному учаснику**.\n"
            "📸 Після вибору бот попросить скриншот-доказ.\n"
            "✅ RP будуть зараховані тільки після підтвердження старшим рангом."
        ),
        color=0x1B365D
    )

    for contract in CONTRACTS[:10]:
        embed.add_field(
            name=f"{contract.get('emoji') or '📄'} {contract['name']}",
            value=(
                f"{contract['description']}\n"
                f"Стандарт: **{format_rp(contract['reward_rp'])} RP** • "
                f"Соло: **{format_rp(contract['reward_rp'] * 2)} RP**"
            ),
            inline=False
        )

    if len(CONTRACTS) > 10:
        embed.add_field(
            name="Інші контракти",
            value="Всі доступні контракти є на кнопках нижче.",
            inline=False
        )

    embed.set_footer(text="ARMANI • CONTRACT SYSTEM")
    await interaction.response.send_message(embed=embed, view=ContractListView(), ephemeral=True)


# ============================================================
# 🎂 АВТОМАТИЧНІ ДНІ НАРОДЖЕННЯ
# ============================================================
@tasks.loop(hours=24)
async def check_birthdays():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id, guild_id, birth_date FROM users WHERE birth_date IS NOT NULL AND birth_date != ''")
        users = cursor.fetchall()
    finally:
        conn.close()

    today_str = datetime.now().strftime("%d.%m")

    for user_id, guild_id, b_date in users:
        b_date_clean = b_date.replace("/", ".").strip()
        parts = b_date_clean.split(".")
        if len(parts) >= 2:
            day_month = f"{parts[0].zfill(2)}.{parts[1].zfill(2)}"

            if day_month == today_str:
                guild = bot.get_guild(guild_id)
                if not guild:
                    continue

                welcome_chan = guild.get_channel(WELCOME_CHANNEL_ID)
                member = guild.get_member(user_id)

                if welcome_chan and member:
                    embed = discord.Embed(
                        title="🎉 З Днем Народження! 🎂",
                        description=(
                            f"🎈 {member.mention} **сьогодні святкує свій День Народження!**\n\n"
                            f"✨ **Бажаємо міцного здоров'я, успіхів у грі та реальному житті!**\n"
                            f"🔥 **Нехай усі досягнення та мрії збуваються!**"
                        ),
                        color=0x1B365D
                    )

                    now_str = datetime.now().strftime("%d.%m.%Y")
                    footer_icon = guild.icon.url if guild.icon else None
                    embed.set_footer(
                        text=f"ARMANI FAMILY • Power. Respect. Elegance. • {now_str}",
                        icon_url=footer_icon
                    )
                    embed.set_thumbnail(url=member.display_avatar.url)
                    await welcome_chan.send(
                        content=f"🥳 Вітаємо {member.mention} з Днем Народження! 🥂",
                        embed=embed
                    )


@check_birthdays.before_loop
async def before_check_birthdays():
    await bot.wait_until_ready()


# ============================================================
# РЕЄСТРАЦІЯ
# ============================================================
class RegistrationModal(discord.ui.Modal, title="Форма реєстрації ARMANI"):
    nickname = discord.ui.TextInput(
        label="Ваше ім'я та прізвище (NickName)",
        placeholder="Katrin Pivoto",
        required=True
    )
    static_id = discord.ui.TextInput(label="Static ID", placeholder="44833", required=True)
    birth_date = discord.ui.TextInput(label="Дата народження", placeholder="ДД.ММ.РРРР", required=True)

    async def on_submit(self, interaction: discord.Interaction):
        channel = interaction.guild.get_channel(CHANNEL_ID)
        role = interaction.guild.get_role(ROLE_ID)

        save_birth_date(interaction.user.id, interaction.guild_id, self.birth_date.value.strip())

        if role:
            try:
                await interaction.user.add_roles(role)
            except Exception as exc:
                print(f"Помилка ролі: {exc}")

        new_nickname = f"{self.nickname.value} | {self.static_id.value}"
        try:
            await interaction.user.edit(nick=new_nickname)
        except Exception as exc:
            print(f"Помилка нікнейму: {exc}")

        embed = discord.Embed(title="✅ Реєстрацію завершено", color=0x2ECC71)
        embed.set_author(
            name=f"{interaction.user.display_name} успішно пройшов(ла) реєстрацію",
            icon_url=interaction.user.display_avatar.url
        )
        embed.add_field(name="Учасник", value=interaction.user.mention, inline=True)
        embed.add_field(name="NickName", value=self.nickname.value, inline=True)
        embed.add_field(name="Static ID", value=self.static_id.value, inline=True)
        embed.add_field(name="Дата народження", value=self.birth_date.value, inline=False)
        embed.set_footer(text=f"ARMANI BOT | Сьогодні о {discord.utils.utcnow().strftime('%H:%M')}")
        embed.set_thumbnail(url=DEFAULT_MENU_IMAGE_URL)

        if channel:
            await channel.send(content=f"Вітаємо {interaction.user.mention}!", embed=embed)

        await interaction.response.send_message(
            "Вашу анкету успішно прийнято! Роль надано.",
            ephemeral=True
        )


class RegistrationView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(
        label="Пройти реєстрацію ARMANI",
        style=discord.ButtonStyle.red,
        custom_id="reg_button"
    )
    async def open_modal(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(RegistrationModal())


# ============================================================
# 🆕 ГОЛОВНЕ МЕНЮ: ПРОФІЛЬ / КОНТРАКТИ / TOP ARMANI
# ============================================================
class MainMenuView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(
        label="🔷 Профіль",
        style=discord.ButtonStyle.primary,
        custom_id="menu_profile",
        row=0
    )
    async def profile_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await send_profile(interaction, interaction.user)

    @discord.ui.button(
        label="📄 Контракти",
        style=discord.ButtonStyle.primary,
        custom_id="menu_contracts",
        row=0
    )
    async def contracts_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await send_contract_menu(interaction)

    @discord.ui.button(
        label="🏆 TOP ARMANI",
        style=discord.ButtonStyle.primary,
        custom_id="menu_top_armani",
        row=0
    )
    async def top_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await send_top(interaction)

    @discord.ui.button(
        label="👥 Кадри",
        style=discord.ButtonStyle.secondary,
        custom_id="menu_staff",
        row=1
    )
    async def staff_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message(
            "Тут буде управління **кадрами** та складом.",
            ephemeral=True
        )

    @discord.ui.button(
        label="ℹ️ Про сім'ю",
        style=discord.ButtonStyle.secondary,
        custom_id="menu_info",
        row=1
    )
    async def info_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message(
            "Ласкаво просимо до офіційного дискорду **ARMANI FAMILY**!",
            ephemeral=True
        )


# ============================================================
# ПОДІЇ ВХОДУ / ВИХОДУ
# ============================================================
@bot.event
async def on_member_join(member: discord.Member):
    welcome_channel = member.guild.get_channel(WELCOME_CHANNEL_ID)
    if welcome_channel:
        embed = discord.Embed(
            title="😼 Щоб увійти в наш склад повноцінно, треба пройти реєстрацію до кінця.",
            description=f"Ласкаво просимо, {member.mention}!\n\nНатисніть кнопку нижче і пройдіть швидку реєстрацію.",
            color=0x1B365D
        )
        embed.set_image(url=DEFAULT_MENU_IMAGE_URL)
        await welcome_channel.send(
            content=f"Вітаємо, {member.mention}!",
            embed=embed,
            view=RegistrationView()
        )


@bot.event
async def on_member_remove(member: discord.Member):
    delete_user_from_db(member.id, member.guild.id)


@bot.event
async def on_raw_member_remove(payload: discord.RawMemberRemoveEvent):
    delete_user_from_db(payload.user.id, payload.guild_id)


# ============================================================
# СЛЕШ-КОМАНДИ RP / ПРОФІЛЬ / РАНГИ
# ============================================================
@bot.tree.command(name="profile", description="Переглянути ARMANI профіль")
@app_commands.describe(member="Учасник, профіль якого хочеш подивитися")
async def profile_command(interaction: discord.Interaction, member: discord.Member = None):
    target = member or interaction.user
    await send_profile(interaction, target)


@bot.tree.command(name="top_armani", description="TOP-10 ARMANI за поточним балансом RP")
async def top_armani_command(interaction: discord.Interaction):
    await send_top(interaction)


@bot.tree.command(name="contracts", description="Відкрити меню контрактів ARMANI")
async def contracts_command(interaction: discord.Interaction):
    await send_contract_menu(interaction)


@bot.tree.command(name="rp_spend", description="Списати RP за покупку / нагороду")
@app_commands.describe(
    member="У кого списати RP",
    amount="Скільки RP списати",
    reason="На що витрачено RP"
)
@app_commands.checks.has_permissions(administrator=True)
async def rp_spend_command(
    interaction: discord.Interaction,
    member: discord.Member,
    amount: int,
    reason: str
):
    # Discord очікує першу відповідь дуже швидко.
    # defer() одразу підтверджує команду і прибирає помилку 10062 Unknown interaction.
    await interaction.response.defer()

    # SQLite може чекати блокування БД, тому запускаємо його поза event loop.
    success, result = await asyncio.to_thread(
        spend_rp,
        member.id,
        interaction.guild_id,
        amount,
        reason
    )

    if not success:
        await interaction.followup.send(f"❌ {result}", ephemeral=True)
        return

    embed = discord.Embed(title="💳 RP SPENT", color=0x1B365D)
    embed.description = f"{member.mention} витратив **{format_rp(amount)} RP**."
    embed.add_field(name="🛍️ Причина", value=reason, inline=False)
    embed.add_field(name="💰 Новий баланс", value=f"`{format_rp(result)} RP`", inline=True)
    embed.set_footer(text="TOP ARMANI автоматично використовує новий баланс")
    await interaction.followup.send(embed=embed)


@bot.tree.command(name="rank_set", description="Встановити ранг вручну БЕЗ зміни RP")
@app_commands.describe(member="Кому змінити ранг", level="Рівень рангу з RANKS")
@app_commands.checks.has_permissions(administrator=True)
async def rank_set_command(interaction: discord.Interaction, member: discord.Member, level: int):
    valid_levels = [rank["level"] for rank in RANKS]
    if level not in valid_levels:
        await interaction.response.send_message(
            f"❌ Невірний рівень. Доступні: {', '.join(map(str, valid_levels))}",
            ephemeral=True
        )
        return

    ok, error = await set_discord_rank_role(member, level)
    if not ok:
        await interaction.response.send_message(f"❌ {error}", ephemeral=True)
        return

    ensure_user(member.id, interaction.guild_id)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users
            SET rank_level = ?, rank_source = 'manual'
            WHERE user_id = ? AND guild_id = ?
        """, (level, member.id, interaction.guild_id))
        conn.commit()
    finally:
        conn.close()

    rank = get_rank_data(level)
    stats = get_user_stats(member.id, interaction.guild_id)

    embed = discord.Embed(title="🎖️ Ранг змінено вручну", color=0x1B365D)
    embed.description = f"{member.mention} → **{rank['name']}** · LVL {level}"
    embed.add_field(name="💰 Баланс RP", value=f"`{format_rp(stats['rp_balance'])} RP`", inline=True)
    embed.add_field(
        name="📄 Зароблено контрактами",
        value=f"`{format_rp(stats['contract_rp_earned'])} RP`",
        inline=True
    )
    embed.add_field(
        name="ℹ️ Важливо",
        value="Ручна зміна рангу **не додає RP** і **не змінює TOP ARMANI**.",
        inline=False
    )
    await interaction.response.send_message(embed=embed)


@bot.tree.command(name="rank_auto", description="Перевірити автоматичний ранг по контрактних RP")
@app_commands.describe(member="Учасник для перевірки")
@app_commands.checks.has_permissions(administrator=True)
async def rank_auto_command(interaction: discord.Interaction, member: discord.Member):
    stats = get_user_stats(member.id, interaction.guild_id)
    auto_level = get_auto_rank_level(stats["contract_rp_earned"])
    current_level = stats["rank_level"]

    if auto_level <= current_level:
        await interaction.response.send_message(
            f"ℹ️ Авто-рівень: **{get_rank_data(auto_level)['name']}** (LVL {auto_level}). "
            f"Поточний: **{get_rank_data(current_level)['name']}** (LVL {current_level}). Змін не потрібно.",
            ephemeral=True
        )
        return

    promoted, new_level, error = await sync_member_rank(member)
    if error:
        await interaction.response.send_message(f"❌ {error}", ephemeral=True)
        return

    await interaction.response.send_message(
        f"✅ {member.mention} автоматично підвищено до "
        f"**{get_rank_data(new_level)['name']}** · LVL {new_level}.",
        ephemeral=True
    )


# ============================================================
# ОСНОВНІ СЛЕШ-КОМАНДИ
# ============================================================
@bot.tree.command(name="setup_reg", description="Створити плашку реєстрації")
@app_commands.checks.has_permissions(administrator=True)
async def setup_reg(interaction: discord.Interaction):
    embed = discord.Embed(
        title="🛡️ РЕЄСТРАЦІЯ",
        description="Щоб отримати доступ до систем та дискорду, пройдіть коротку реєстрацію, натиснувши кнопку нижче.",
        color=0x1B365D
    )
    embed.set_image(url=DEFAULT_MENU_IMAGE_URL)
    await interaction.channel.send(embed=embed, view=RegistrationView())
    await interaction.response.send_message("✅ Панель реєстрації створена!", ephemeral=True)


@bot.tree.command(name="menu", description="Створити головне меню")
@app_commands.checks.has_permissions(administrator=True)
async def menu_command(interaction: discord.Interaction):
    embed = discord.Embed(
        title="⚡ ARMANI FAMILY • Головне меню",
        description=(
            "Виберіть потрібний розділ нижче.\n\n"
            "🔷 **Профіль** — RP, ранг, прогрес і статистика.\n"
            "📄 **Контракти** — подача виконаного контракту.\n"
            "🏆 **TOP ARMANI** — рейтинг за поточним балансом RP."
        ),
        color=0x1B365D
    )
    embed.set_image(url=DEFAULT_MENU_IMAGE_URL)
    await interaction.channel.send(embed=embed, view=MainMenuView())
    await interaction.response.send_message("✅ Головне меню успішно створено!", ephemeral=True)


# ============================================================
# ЗАПУСК БОТА + ВІДНОВЛЕННЯ КНОПОК PENDING-КОНТРАКТІВ
# ============================================================
_views_registered = False


@bot.event
async def on_ready():
    global _views_registered

    init_db()

    if not _views_registered:
        bot.add_view(RegistrationView())
        bot.add_view(MainMenuView())

        # 🆕 Після перезапуску бота pending-заявки знову мають робочі кнопки.
        for submission_id in get_pending_submission_ids():
            bot.add_view(ContractApprovalView(submission_id))

        _views_registered = True

    if not website_sync.loop.is_running():
        website_sync.loop.start()

    if not check_birthdays.is_running():
        check_birthdays.start()

    try:
        guild_object = discord.Object(id=GUILD_ID)
        bot.tree.copy_global_to(guild=guild_object)
        synced = await bot.tree.sync(guild=guild_object)
        print(f"Миттєво синхронізовано {len(synced)} слеш-команд для сервера {GUILD_ID}.")
    except Exception as exc:
        print(f"Помилка синхронізації команд: {exc}")

    print(f"✅ Бот {bot.user} успішно запущений!")


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("Заповніть DISCORD_TOKEN у .env поруч із armani.py")
    bot.run(TOKEN)
