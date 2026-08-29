const { createClient } = require('@libsql/client');
require('dotenv').config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDatabase() {
  try {
    await db.batch([
      // 1. Quản lý người dùng toàn cục
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

      // 2. Cài đặt hệ thống (Admin tùy biến)
      `CREATE TABLE IF NOT EXISTS system_settings (
          setting_key TEXT PRIMARY KEY,
          setting_value TEXT NOT NULL
      )`,

      // 3. Danh mục vật phẩm Shop
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

      // 4. Kho đồ & Lịch sử hóa đơn mua hàng
      `CREATE TABLE IF NOT EXISTS user_inventory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_id TEXT UNIQUE NOT NULL,
          discord_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          item_name TEXT NOT NULL,
          item_data TEXT NOT NULL,
          reward_type TEXT NOT NULL,
          price INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // 5. Đặc quyền người dùng (Vé VIP Game, Giảm phí trade...)
      `CREATE TABLE IF NOT EXISTS user_perks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_id TEXT NOT NULL,
          perk_type TEXT NOT NULL,
          perk_value TEXT NOT NULL,
          expires_at INTEGER NOT NULL
      )`,

      // 6. Phiên link & Giao dịch
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

    // Khởi tạo các giá trị cấu hình mặc định
    await db.execute("INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES ('task_reward_coins', '50')");
    await db.execute("INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES ('daily_task_limit', '3')");
    await db.execute("INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES ('trade_fee_percent', '5')");

    // Khởi tạo mặt hàng mẫu nếu shop chưa có hàng
    const checkShop = await db.execute("SELECT COUNT(*) as count FROM shop_items");
    if (checkShop.rows[0].count === 0) {
      await db.batch([
        {
          sql: "INSERT INTO shop_items (item_id, item_name, price, reward_type, reward_data, description) VALUES (?, ?, ?, ?, ?, ?)",
          args: ['vip_pass_7d', '👑 Vé VIP Thành Viên (7 Ngày)', 300, 'PERK_PASS', '7', 'Miễn phí minigame và giảm 100% phí chuyển Coin']
        },
        {
          sql: "INSERT INTO shop_items (item_id, item_name, price, reward_type, reward_data, description) VALUES (?, ?, ?, ?, ?, ?)",
          args: ['key_tool_vip', '🔑 Key VIP Tool Kích Hoạt 30 Ngày', 500, 'DM_ACCOUNT', 'KEY-VIP-8899-AABB-CCDD', 'Mã bản quyền gửi tự động vào tin nhắn riêng']
        },
        {
          sql: "INSERT INTO shop_items (item_id, item_name, price, reward_type, reward_data, description) VALUES (?, ?, ?, ?, ?, ?)",
          args: ['acc_random_steam', '🎮 Tài Khoản Game Random VIP', 800, 'MANUAL_ADMIN', 'Tài khoản cấp thủ công bởi Admin', 'Admin sẽ liên hệ trao tài khoản trực tiếp']
        }
      ], 'write');
    }

    console.log('✅ Cơ sở dữ liệu Turso đã đồng bộ hoàn tất!');
  } catch (err) {
    console.error('❌ Lỗi Database Turso:', err.message);
  }
}

initDatabase();

module.exports = db;