const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../database.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS global_users (
        discord_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        coin_balance INTEGER DEFAULT 0,
        daily_task_count INTEGER DEFAULT 0,
        completed_providers TEXT DEFAULT '',
        last_task_date TEXT DEFAULT CURRENT_DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS link_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        discord_id TEXT NOT NULL,
        provider TEXT DEFAULT 'Direct',
        status TEXT DEFAULT 'PENDING',
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS claim_keys (
        key_code TEXT PRIMARY KEY,
        discord_id TEXT NOT NULL,
        provider TEXT DEFAULT '',
        reward_coins INTEGER DEFAULT 50,
        is_used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        item_data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        fee INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// Tự động bổ sung cột nếu cơ sở dữ liệu đã tồn tại từ trước
try { db.prepare("ALTER TABLE global_users ADD COLUMN completed_providers TEXT DEFAULT ''").run(); } catch (e) {}
try { db.prepare("ALTER TABLE link_sessions ADD COLUMN provider TEXT DEFAULT 'Direct'").run(); } catch (e) {}
try { db.prepare("ALTER TABLE claim_keys ADD COLUMN provider TEXT DEFAULT ''").run(); } catch (e) {}

module.exports = db;