const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');
const db = require('../../database');
const { generateShortLink } = require('../../utils/shortener');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nhiemvu')
        .setDescription('Nhận link nhiệm vụ vượt link để kiếm Coin (Tối đa 3 lượt/ngày, mỗi link 1 lần)'),

    async execute(interaction) {
        const userId = interaction.user.id;
        let user = db.prepare('SELECT * FROM global_users WHERE discord_id = ?').get(userId);

        if (!user) {
            return interaction.reply({ content: '⚠️ Bạn chưa liên kết tài khoản! Hãy dùng `/link` trước.', ephemeral: true });
        }

        const today = new Date().toISOString().split('T')[0];
        if (user.last_task_date !== today) {
            db.prepare('UPDATE global_users SET daily_task_count = 0, completed_providers = "", last_task_date = ? WHERE discord_id = ?').run(today, userId);
            user.daily_task_count = 0;
            user.completed_providers = '';
        }

        const completedList = (user.completed_providers || '').split(',').filter(Boolean);

        if (user.daily_task_count >= 3 || completedList.length >= 3) {
            return interaction.reply({
                content: '🛑 Bạn đã hoàn thành toàn bộ **3/3 cổng link hôm nay** (Link4M, YeuMoney, AnonLink)! Hãy quay lại vào ngày mai.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        // 1. Tạo Token phiên
        const token = crypto.randomBytes(16).toString('hex');
        const now = Date.now();
        const expiresAt = now + (10 * 60 * 1000);

        // 2. Tạo link đích
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const rawDestinationUrl = `${baseUrl}/verify.html?token=${token}`;

        // 3. Rút gọn link (loại trừ các nhà mạng đã làm hôm nay)
        const result = await generateShortLink(rawDestinationUrl, completedList);

        if (!result) {
            return interaction.editReply({
                content: '🛑 Bạn đã vượt hết các cổng link khả dụng trong ngày hôm nay rồi!'
            });
        }

        const { provider, shortUrl } = result;

        // Lưu phiên kèm nhà mạng tương ứng
        db.prepare(`
            INSERT INTO link_sessions (token, discord_id, provider, status, created_at, expires_at)
            VALUES (?, ?, ?, 'PENDING', ?, ?)
        `).run(token, userId, provider, now, expiresAt);

        const embed = new EmbedBuilder()
            .setTitle('🎯 Nhiệm Vụ Kiếm Coin Hằng Ngày')
            .setColor('#F59E0B')
            .setDescription(`Vượt link an toàn để nhận ngay **+50 Coin** vào ví!\n\n` +
                            `• Tiến độ hôm nay: \`${user.daily_task_count}/3\` lượt\n` +
                            `• Cổng vượt link: \`${provider}\` *(Mỗi cổng chỉ vượt 1 lần/ngày)*\n` +
                            `• Thời hạn link: \`10 phút\`\n` +
                            `• Sau khi vượt link xong, bấm nút **🎁 Nhập Mã Key** ngay bên dưới để nhận thưởng.`)
            .setFooter({ text: 'Lưu ý: Không sử dụng tool bypass để tránh bị khóa link.' });

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