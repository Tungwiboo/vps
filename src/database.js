const { createClient } = require('@libsql/client');
require('dotenv').config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDatabase() {
  try {
    await db.batch([
      // 1. Quản lý người dùng
      `CREATE TABLE IF NOT EXISTS global_users (
          discord_id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          coin_balance INTEGER DEFAULT 0,
          daily_task_count INTEGER DEFAULT 0,
          total_links_completed INTEGER DEFAULT 0,
          completed_providers TEXT DEFAULT '',
          last_task_date TEXT DEFAULT CURRENT_DATE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // 2. Cài đặt hệ thống
      `CREATE TABLE IF NOT EXISTS system_settings (
          setting_key TEXT PRIMARY KEY,
          setting_value TEXT NOT NULL
      )`,

      // 3. Cửa hàng
      `CREATE TABLE IF NOT EXISTS shop_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id TEXT UNIQUE NOT NULL,
          item_name TEXT NOT NULL,
          price INTEGER NOT NULL,
          reward_type TEXT NOT NULL, 
          reward_data TEXT DEFAULT '', 
          description TEXT DEFAULT '',
          is_active INTEGER DEFAULT 1
      )`,

      // 4. Kho đồ & Hóa đơn
      `CREATE TABLE IF NOT EXISTS user_inventory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_id TEXT DEFAULT 'N/A',
          discord_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          item_name TEXT NOT NULL,
          item_data TEXT NOT NULL,
          reward_type TEXT DEFAULT 'DM_ACCOUNT',
          price INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // 5. Đặc quyền VIP
      `CREATE TABLE IF NOT EXISTS user_perks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_id TEXT NOT NULL,
          perk_type TEXT NOT NULL,
          perk_value TEXT NOT NULL,
          expires_at INTEGER NOT NULL
      )`,

      // 6. Link & Key
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
      `CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender_id TEXT NOT NULL,
          receiver_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          fee INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ], 'write');

    // Tự động bổ sung các cột nếu database cũ chưa có
    try { await db.execute("ALTER TABLE global_users ADD COLUMN total_links_completed INTEGER DEFAULT 0"); } catch (e) {}
    try { await db.execute("ALTER TABLE global_users ADD COLUMN completed_providers TEXT DEFAULT ''"); } catch (e) {}
    try { await db.execute("ALTER TABLE user_inventory ADD COLUMN invoice_id TEXT DEFAULT 'N/A'"); } catch (e) {}
    try { await db.execute("ALTER TABLE user_inventory ADD COLUMN reward_type TEXT DEFAULT 'DM_ACCOUNT'"); } catch (e) {}
    try { await db.execute("ALTER TABLE user_inventory ADD COLUMN price INTEGER DEFAULT 0"); } catch (e) {}

    // Cấu hình mặc định
    await db.execute("INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES ('task_reward_coins', '50')");
    await db.execute("INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES ('daily_task_limit', '3')");
    await db.execute("INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES ('trade_fee_percent', '5')");

    console.log('✅ Khởi tạo và đồng bộ Database Turso thành công!');
  } catch (err) {
    console.error('❌ Lỗi kết nối Database Turso:', err.message);
  }
}

initDatabase();

module.exports = db;