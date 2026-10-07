"""Read-only bridge: the existing SQLite RP balance remains the source of truth."""
import asyncio
import os
import time
from contextlib import closing

import aiohttp
from discord.ext import tasks

SYNC_URL = 'https://armani-famili.vercel.app/api/rp-sync'


def read_top(connect, guild_id):
    with closing(connect()) as conn:
        return conn.execute('''SELECT user_id, rp_balance, contract_rp_earned FROM users
            WHERE guild_id = ?
            ORDER BY rp_balance DESC, contract_rp_earned DESC, user_id ASC LIMIT 10''',
            (guild_id,)).fetchall()


def build_entries(rows, guild):
    entries = []
    for position, (uid, balance, earned) in enumerate(rows, 1):
        member = guild.get_member(uid)
        name = member.display_name if member else str(uid)
        name = str(name).strip()[:40]
        if len(name) < 2:
            name = str(uid)
        # Keep balances exact: refuse invalid data, never silently clamp RP.
        if any(type(value) is not int or not 0 <= value <= 999999999 for value in (balance, earned)):
            raise ValueError('RP поза діапазоном API; синхронізацію пропущено.')
        entries.append({'discord_id': str(uid), 'nickname': name, 'rp_balance': balance,
                        'contract_rp_earned': earned, 'position': position})
    return entries


class WebsiteSync:
    def __init__(self, bot, guild_id, connect):
        self.bot, self.guild_id, self.connect = bot, guild_id, connect
        self.token = os.getenv('BOT_SYNC_TOKEN', '').strip()
        self.pending = None
        self.last_version = 0
        self.last_status = None

    def status(self, message):
        if message != self.last_status:
            print('[ARMANI SITE]', message)
            self.last_status = message

    async def sync_once(self):
        if not 32 <= len(self.token) <= 512:
            self.status('Заповніть BOT_SYNC_TOKEN у .env (32–512 символів).')
            return
        guild = self.bot.get_guild(self.guild_id)
        if guild is None:
            self.status('Бот ще не бачить потрібний Discord-сервер.')
            return
        # A failed request is retried with exactly the same version and data.
        if self.pending is None:
            rows = await asyncio.to_thread(read_top, self.connect, self.guild_id)
            entries = build_entries(rows, guild)
            self.last_version = max(int(time.time() * 1000), self.last_version + 1)
            self.pending = {'guild_id': str(self.guild_id), 'version': self.last_version,
                            'entries': entries}
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
            async with session.post(SYNC_URL, json=self.pending,
                                    headers={'Authorization': 'Bearer ' + self.token},
                                    allow_redirects=False) as response:
                if response.status != 200:
                    self.status(f'HTTP {response.status}: перевірте інструкцію. Повтор через 30 с.')
                    return
                result = await response.json()
                if type(result.get('applied')) is not bool:
                    self.status('Невірна відповідь API. Перевірте deployment.')
                    return
        # False means an already applied or newer snapshot; read current data next time.
        self.pending = None
        self.status('TOP RP передано на сайт.')

    @tasks.loop(seconds=30)
    async def loop(self):
        try:
            await self.sync_once()
        except (aiohttp.ClientError, asyncio.TimeoutError):
            self.status('Мережева помилка. Повтор через 30 с.')
        except Exception as exc:
            # Do not print request headers, tokens or arbitrary upstream messages.
            self.status('Помилка синхронізації: ' + type(exc).__name__)

    @loop.before_loop
    async def before_loop(self):
        await self.bot.wait_until_ready()
