const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const db = require('./database'); // hoặc require('./src/database') tùy vị trí file

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'))); // hoặc path.join(__dirname, 'public')

// API Xác thực vượt link & Sinh Key
app.post('/api/verify', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ success: false, message: 'Thiếu mã token xác thực!' });
        }

        // 1. Kiểm tra phiên link trong database
        const sessionRes = await db.execute({
            sql: "SELECT * FROM link_sessions WHERE token = ?",
            args: [token]
        });
        const session = sessionRes.rows[0];

        if (!session) {
            return res.status(404).json({ success: false, message: 'Phiên vượt link không hợp lệ hoặc đã hết hạn!' });
        }

        if (session.status === 'COMPLETED') {
            return res.status(400).json({ success: false, message: 'Mã vượt link này đã được nhận thưởng trước đó rồi!' });
        }

        if (Date.now() > session.expires_at) {
            return res.status(400).json({ success: false, message: 'Phiên vượt link đã quá thời gian quy định (10 phút)!' });
        }

        // 2. Lấy cấu hình số coin thưởng từ hệ thống
        const settingsRes = await db.execute("SELECT setting_value FROM system_settings WHERE setting_key = 'task_reward_coins'");
        const rewardCoins = parseInt(settingsRes.rows[0]?.setting_value) || 50;

        // 3. Sinh mã Key ngẫu nhiên
        const keyCode = 'KEY-' + session.provider.toUpperCase().replace(/\s+/g, '') + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();

        // 4. Lấy danh sách cổng đã vượt của User để nối thêm
        const userRes = await db.execute({
            sql: "SELECT completed_providers FROM global_users WHERE discord_id = ?",
            args: [session.discord_id]
        });
        const currentProviders = userRes.rows[0]?.completed_providers || '';
        const updatedProviders = currentProviders ? `${currentProviders},${session.provider}` : session.provider;

        // 5. Ghi nhận Key & Cập nhật trạng thái
        await db.batch([
            // Tạo Key nhận thưởng
            {
                sql: `INSERT INTO claim_keys (key_code, discord_id, provider, reward_type, reward_coins, is_used) VALUES (?, ?, ?, 'COIN', ?, 0)`,
                args: [keyCode, session.discord_id, session.provider, rewardCoins]
            },
            // Đánh dấu phiên vượt link đã xong
            {
                sql: "UPDATE link_sessions SET status = 'COMPLETED' WHERE token = ?",
                args: [token]
            },
            // Cập nhật danh sách cổng đã vượt của user
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

// Chạy Web Server
app.listen(PORT, () => {
    console.log(`🌐 Web GetKey đang chạy tại cổng: ${PORT}`);
});

module.exports = app;