"""Offline tests: execute only pure helpers extracted from source; no bot login."""
import ast
import sqlite3
import tempfile
import unittest
from pathlib import Path
from contextlib import closing

ROOT = Path(__file__).resolve().parents[1]

def helpers():
    tree = ast.parse((ROOT/'bot/website_sync.py').read_text())
    funcs = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ('read_top','build_entries')]
    namespace = {'closing': closing}
    exec(compile(ast.Module(body=funcs, type_ignores=[]), 'helpers', 'exec'), namespace)
    return namespace

class Guild:
    def get_member(self, uid):
        if uid == 768426180709711882:
            return type('Member', (), {'display_name':'Armani | 123'})()
        return None

class RankingTests(unittest.TestCase):
    def test_same_order_spending_guild_and_limit(self):
        h = helpers()
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'test.db'
            connect = lambda: sqlite3.connect(path)
            with closing(connect()) as db:
                db.execute('CREATE TABLE users (user_id INTEGER, guild_id INTEGER, rp_balance INTEGER, contract_rp_earned INTEGER)')
                db.executemany('INSERT INTO users VALUES (?,?,?,?)', [
                    (768426180709711882,1,500,1000), (768426180709711883,1,500,1500),
                    (768426180709711884,1,500,1500), (768426180709711885,2,9999,9999)])
                db.commit()
            rows=h['read_top'](connect,1)
            self.assertEqual([r[0] for r in rows],[768426180709711883,768426180709711884,768426180709711882])
            entries=h['build_entries'](rows,Guild())
            self.assertEqual(entries[2]['nickname'],'Armani | 123')
            self.assertEqual([e['position'] for e in entries],[1,2,3])
            with closing(connect()) as db:
                db.execute('UPDATE users SET rp_balance=100 WHERE user_id=768426180709711883')
                db.commit()
            self.assertEqual(h['read_top'](connect,1)[-1][0],768426180709711883)
            with closing(connect()) as db:
                db.executemany('INSERT INTO users VALUES (?,1,0,0)',[(800000000000000000+i,) for i in range(20)])
                db.commit()
            self.assertEqual(len(h['read_top'](connect,1)),10)

    def test_invalid_balance_not_clamped(self):
        with self.assertRaises(ValueError):
            helpers()['build_entries']([(768426180709711882,-1,10)],Guild())
        self.assertEqual(helpers()['build_entries']([],Guild()),[])

if __name__=='__main__': unittest.main()
