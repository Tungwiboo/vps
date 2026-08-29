const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');
const db = require('../../database');
const { generateShortLink } = require('../../utils/shortener');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nhiemvu')
        .setDescription('Nhận link nhiệm vụ vượt link kiếm Coin'),

    async execute(interaction) {
        const userId = interaction.user.id;

        const userRes = await db.execute({
            sql: 'SELECT * FROM global_users WHERE discord_id = ?',
            args: [userId]
        });
        let user = userRes.rows[0];

        if (!user) {
            return interaction.reply({ content: '⚠️ Bạn chưa liên kết tài khoản! Hãy dùng `/link` trước.', ephemeral: true });
        }

        // Lấy giới hạn và phần thưởng cấu hình động từ Admin
        const settingsRes = await db.execute("SELECT * FROM system_settings");
        const settings = {};
        settingsRes.rows.forEach(r => settings[r.setting_key] = r.setting_value);

        const dailyLimit = parseInt(settings.daily_task_limit) || 3;
        const rewardCoins = parseInt(settings.task_reward_coins) || 50;

        const today = new Date().toISOString().split('T')[0];
        if (user.last_task_date !== today) {
            await db.execute({
                sql: 'UPDATE global_users SET daily_task_count = 0, completed_providers = "", last_task_date = ? WHERE discord_id = ?',
                args: [today, userId]
            });
            user.daily_task_count = 0;
            user.completed_providers = '';
        }

        const completedList = (user.completed_providers || '').split(',').filter(Boolean);

        if (user.daily_task_count >= dailyLimit || completedList.length >= dailyLimit) {
            return interaction.reply({
                content: `🛑 Bạn đã hoàn thành toàn bộ **${dailyLimit}/${dailyLimit} lượt hôm nay**! Hãy quay lại vào ngày mai.`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const token = crypto.randomBytes(16).toString('hex');
        const now = Date.now();
        const expiresAt = now + (10 * 60 * 1000);

        const baseUrl = process.env.BASE_URL || 'https://discord-bot-key-53oj.onrender.com';
        const rawDestinationUrl = `${baseUrl}/verify.html?token=${token}`;

        const result = await generateShortLink(rawDestinationUrl, completedList);

        if (!result) {
            return interaction.editReply({
                content: '🛑 Bạn đã vượt hết các cổng link khả dụng hôm nay rồi!'
            });
        }

        const { provider, shortUrl } = result;

        await db.execute({
            sql: `INSERT INTO link_sessions (token, discord_id, provider, status, created_at, expires_at) VALUES (?, ?, ?, 'PENDING', ?, ?)`,
            args: [token, userId, provider, now, expiresAt]
        });

        const embed = new EmbedBuilder()
            .setTitle('🎯 Nhiệm Vụ Kiếm Coin Hằng Ngày')
            .setColor('#F59E0B')
            .setDescription(`Vượt link an toàn để nhận ngay **+${rewardCoins} Coin** vào ví!\n\n` +
                            `• Tiến độ hôm nay: \`${user.daily_task_count}/${dailyLimit}\` lượt\n` +
                            `• Cổng vượt link: \`${provider}\` *(Mỗi cổng chỉ vượt 1 lần/ngày)*\n` +
                            `• Thời hạn link: \`10 phút\`\n` +
                            `• Sau khi hoàn thành, dùng lệnh \`/redeem\` hoặc bấm nút dưới đây để nhận thưởng.`)
            .setFooter({ text: 'Lưu ý: Không sử dụng tool bypass để tránh bị khóa tài khoản.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('🔗 Bắt Đầu Vượt Link')
                .setStyle(ButtonStyle.Link)
                .setURL(shortUrl),
            new ButtonBuilder()
                .setCustomId('btn_open_redeem_modal')
                .setLabel('🎁 Nhập Mã Key')
                .setStyle(ButtonStyle.Success)
        );

        return interaction.editReply({ embeds: [embed], components: [row] });
    }
};