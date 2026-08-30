const express = require('express');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');

const app = express();

// Cấu hình CORS thủ công
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Xác thực vượt link & Chống Bypass < 40 giây
app.post('/api/verify', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ success: false, message: 'Thiếu mã token xác thực!' });
        }

        // 1. Kiểm tra token trong Turso
        const sessionRes = await db.execute({
            sql: "SELECT * FROM link_sessions WHERE token = ?",
            args: [token]
        });
        const session = sessionRes.rows[0];

        if (!session) {
            return res.status(404).json({ success: false, message: 'Phiên vượt link không tồn tại hoặc đã bị hủy!' });
        }

        if (session.status === 'COMPLETED') {
            return res.status(400).json({ success: false, message: 'Mã vượt link này đã được nhận thưởng trước đó rồi!' });
        }

        const now = Date.now();

        // 2. Kiểm tra hết hạn phiên (10 phút)
        if (now > session.expires_at) {
            return res.status(400).json({ success: false, message: 'Phiên vượt link đã hết hạn (quá 10 phút)!' });
        }

        // 3. Hệ thống chống Bypass: Yêu cầu thời gian thực hiện tối thiểu 40 giây
        const MIN_REQUIRED_SECONDS = 40;
        const elapsedSeconds = Math.floor((now - session.created_at) / 1000);

        if (elapsedSeconds < MIN_REQUIRED_SECONDS) {
            return res.status(403).json({
                success: false,
                message: `🛑 Phát hiện hành vi bất thường! Bạn hoàn thành chỉ trong ${elapsedSeconds}s ).`
            });
        }

        // 4. Lấy cấu hình số coin thưởng
        const settingsRes = await db.execute("SELECT setting_value FROM system_settings WHERE setting_key = 'task_reward_coins'");
        const rewardCoins = parseInt(settingsRes.rows[0]?.setting_value) || 50;

        // 5. Sinh mã Key ngẫu nhiên
        const cleanProvider = (session.provider || 'Direct').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const keyCode = 'KEY-' + cleanProvider + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();

        // 6. Cập nhật danh sách cổng đã vượt
        const userRes = await db.execute({
            sql: "SELECT completed_providers FROM global_users WHERE discord_id = ?",
            args: [session.discord_id]
        });
        const currentProviders = userRes.rows[0]?.completed_providers || '';
        const updatedProviders = currentProviders ? `${currentProviders},${session.provider}` : session.provider;

        // 7. Ghi nhận Key & Hoàn tất phiên
        await db.batch([
            {
                sql: `INSERT INTO claim_keys (key_code, discord_id, provider, reward_type, reward_coins, is_used) VALUES (?, ?, ?, 'COIN', ?, 0)`,
                args: [keyCode, session.discord_id, session.provider, rewardCoins]
            },
            {
                sql: "UPDATE link_sessions SET status = 'COMPLETED' WHERE token = ?",
                args: [token]
            },
            {
                sql: "UPDATE global_users SET completed_providers = ? WHERE discord_id = ?",
                args: [updatedProviders, session.discord_id]
            }
        ], 'write');

        return res.json({
            success: true,
            key: keyCode,
            reward_coins: rewardCoins,
            message: 'Xác thực thành công!'
        });

    } catch (error) {
        console.error('❌ Lỗi tại /api/verify:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Lỗi máy chủ khi sinh key! Vui lòng thử lại sau.' 
        });
    }
});

module.exports = app;