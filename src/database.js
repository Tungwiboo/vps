const { createClient } = require('@libsql/client');
require('dotenv').config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDatabase() {
  try {
    await db.batch([
      `CREATE TABLE IF NOT EXISTS global_users (
          discord_id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          coin_balance INTEGER DEFAULT 0,
          daily_task_count INTEGER DEFAULT 0,
          completed_providers TEXT DEFAULT '',
          last_task_date TEXT DEFAULT CURRENT_DATE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS link_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT UNIQUE NOT NULL,
          discord_id TEXT NOT NULL,
          provider TEXT DEFAULT 'Direct',
          status TEXT DEFAULT 'PENDING',
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS claim_keys (
          key_code TEXT PRIMARY KEY,
          discord_id TEXT NOT NULL,
          provider TEXT DEFAULT '',
          reward_coins INTEGER DEFAULT 50,
          is_used INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS user_inventory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          item_name TEXT NOT NULL,
          item_data TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender_id TEXT NOT NULL,
          receiver_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          fee INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ], 'write');

    // Tự động bổ sung cột nếu bảng đã tạo từ trước
    try { await db.execute("ALTER TABLE global_users ADD COLUMN completed_providers TEXT DEFAULT ''"); } catch (e) {}
    try { await db.execute("ALTER TABLE link_sessions ADD COLUMN provider TEXT DEFAULT 'Direct'"); } catch (e) {}
    try { await db.execute("ALTER TABLE claim_keys ADD COLUMN provider TEXT DEFAULT ''"); } catch (e) {}

    console.log('✅ Khởi tạo và kết nối Database Turso thành công!');
  } catch (err) {
    console.error('❌ Lỗi kết nối Database Turso:', err.message);
  }
}

initDatabase();

module.exports = db;