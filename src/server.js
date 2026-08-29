const express = require('express');
const crypto = require('crypto');
const path = require('path');
const db = require('./database');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.post('/api/claim-key', (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ success: false, message: 'Thiếu mã Token xác thực!' });

        const session = db.prepare('SELECT * FROM link_sessions WHERE token = ?').get(token);
        if (!session) return res.status(404).json({ success: false, message: 'Link không hợp lệ hoặc không tồn tại!' });
        if (session.status !== 'PENDING') return res.status(400).json({ success: false, message: 'Link này đã được sử dụng rồi!' });

        const now = Date.now();
        if (now > session.expires_at) return res.status(400).json({ success: false, message: 'Link đã hết hạn (quá 10 phút)!' });

        const timePassed = (now - session.created_at) / 1000;
        if (timePassed < 12) {
            db.prepare("UPDATE link_sessions SET status = 'BANNED' WHERE token = ?").run(token);
            return res.status(403).json({ success: false, message: `Phát hiện vượt link quá nhanh (${timePassed.toFixed(1)}s)! Nghi vấn Bypass. Link đã bị hủy!` });
        }

        const p1 = crypto.randomBytes(2).toString('hex').toUpperCase();
        const p2 = crypto.randomBytes(2).toString('hex').toUpperCase();
        const generatedKey = `KEY-${p1}-${p2}-${Math.floor(1000 + Math.random() * 9000)}`;
        const rewardCoins = 50;

        const tx = db.transaction(() => {
            db.prepare("UPDATE link_sessions SET status = 'COMPLETED' WHERE token = ?").run(token);
            db.prepare("INSERT INTO claim_keys (key_code, discord_id, provider, reward_coins, is_used) VALUES (?, ?, ?, ?, 0)").run(
                generatedKey, 
                session.discord_id, 
                session.provider || 'Direct', 
                rewardCoins
            );
        });
        tx();

        return res.json({ success: true, key: generatedKey, coins: rewardCoins });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi sinh key!' });
    }
});

module.exports = app;