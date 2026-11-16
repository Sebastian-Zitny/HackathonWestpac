"""SQLite persistence. All money is stored as integer cents."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterator

DEFAULT_DB = Path(__file__).resolve().parents[1] / "data" / "autotopup.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
    bsb TEXT NOT NULL, number_masked TEXT NOT NULL,
    balance_cents INTEGER NOT NULL CHECK (balance_cents >= 0)
);
CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
    suburb TEXT NOT NULL, lat REAL, lon REAL, icon TEXT
);
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL, ts TEXT NOT NULL, kind TEXT NOT NULL,
    description TEXT NOT NULL, merchant_id TEXT, category TEXT,
    amount_cents INTEGER NOT NULL, balance_after_cents INTEGER,
    lat REAL, lon REAL, ref TEXT, is_autotopup INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_tx_account_ts ON transactions(account_id, ts);
CREATE TABLE IF NOT EXISTS scheduled (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
    description TEXT NOT NULL, due TEXT NOT NULL, amount_cents INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_intents (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    created_ts TEXT NOT NULL, updated_ts TEXT NOT NULL,
    purchase_txn_id INTEGER, decline_reason TEXT
);
CREATE TABLE IF NOT EXISTS topup_offers (
    id TEXT PRIMARY KEY, intent_id TEXT NOT NULL, amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL, workflow TEXT NOT NULL, trust_score INTEGER,
    assessment_json TEXT NOT NULL, policy_json TEXT NOT NULL,
    created_ts TEXT NOT NULL, expires_ts TEXT NOT NULL, expires_epoch REAL, completed_ts TEXT,
    transfer_ref TEXT, auth_method TEXT, pin_failures INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_offer_intent ON topup_offers(intent_id);
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, kind TEXT NOT NULL,
    title TEXT NOT NULL, body TEXT NOT NULL, offer_id TEXT, intent_id TEXT,
    read INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, event TEXT NOT NULL,
    detail TEXT NOT NULL
);
"""

TABLES = ["kv", "accounts", "merchants", "transactions", "scheduled", "payment_intents",
          "topup_offers", "notifications", "audit"]


class Database:
    def __init__(self, path: str | Path | None = None):
        path = path or os.environ.get("AUTOTOPUP_DB") or DEFAULT_DB
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        self._depth = 0
        self.conn.executescript(SCHEMA)
        # migrate databases created by earlier versions
        cols = {r[1] for r in self.conn.execute("PRAGMA table_info(topup_offers)")}
        if "expires_epoch" not in cols:
            self.conn.execute("ALTER TABLE topup_offers ADD COLUMN expires_epoch REAL")

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        """Serialised, atomic transaction. Nested calls join the outer one."""
        with self.lock:
            outer = self._depth == 0
            if outer:
                self.conn.execute("BEGIN IMMEDIATE")
            self._depth += 1
            try:
                yield self.conn
                self._depth -= 1
                if outer:
                    self.conn.execute("COMMIT")
            except BaseException:
                self._depth -= 1
                if outer:
                    self.conn.execute("ROLLBACK")
                raise

    def q(self, sql: str, args: tuple = ()) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.conn.execute(sql, args).fetchall()]

    def one(self, sql: str, args: tuple = ()) -> dict | None:
        rows = self.q(sql, args)
        return rows[0] if rows else None

    def wipe(self) -> None:
        with self.tx() as c:
            for t in TABLES:
                c.execute(f"DELETE FROM {t}")
            c.execute("DELETE FROM sqlite_sequence")

    # ---------- key/value ----------
    def get_kv(self, key: str, default: Any = None) -> Any:
        row = self.one("SELECT value FROM kv WHERE key=?", (key,))
        return json.loads(row["value"]) if row else default

    def set_kv(self, key: str, value: Any) -> None:
        with self.tx() as c:
            c.execute("INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                      (key, json.dumps(value)))

    # ---------- simulated clock ----------
    def now(self, advance_seconds: int = 0) -> datetime:
        """Simulated Brisbane local time. Optionally advance it (each event ticks forward)."""
        raw = self.get_kv("sim_now")
        cur = datetime.fromisoformat(raw) if raw else datetime.now().replace(microsecond=0)
        if advance_seconds:
            cur = cur + timedelta(seconds=advance_seconds)
            self.set_kv("sim_now", cur.isoformat())
        return cur

    def set_now(self, dt: datetime) -> None:
        self.set_kv("sim_now", dt.replace(microsecond=0).isoformat())

    def audit(self, event: str, detail: dict) -> None:
        with self.tx() as c:
            c.execute("INSERT INTO audit(ts,event,detail) VALUES(?,?,?)",
                      (self.now().isoformat(), event, json.dumps(detail)))
