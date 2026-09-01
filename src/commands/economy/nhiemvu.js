const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const crypto = require('crypto');
const db = require('../../database');
const { generateShortLink } = require('../../utils/shortener');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nhiemvu')
        .setDescription('Nhận link nhiệm vụ vượt link kiếm Coin hằng ngày'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const userId = interaction.user.id;

        try {
            const userRes = await db.execute({
                sql: 'SELECT * FROM global_users WHERE discord_id = ?',
                args: [userId]
            });
            let user = userRes.rows[0];

            if (!user) {
                return interaction.editReply({ content: '⚠️ Bạn chưa liên kết tài khoản! Hãy dùng `/link` trước.' });
            }

            const settingsRes = await db.execute("SELECT * FROM system_settings");
            const settings = {};
            settingsRes.rows.forEach(r => settings[r.setting_key] = r.setting_value);

            const dailyLimit = parseInt(settings.daily_task_limit) || 3;
            const rewardCoins = parseInt(settings.task_reward_coins) || 50;

            const today = new Date().toISOString().split('T')[0];
            if (user.last_task_date !== today) {
                await db.execute({
                    sql: "UPDATE global_users SET daily_task_count = 0, completed_providers = '', last_task_date = ? WHERE discord_id = ?",
                    args: [today, userId]
                });
                user.daily_task_count = 0;
                user.completed_providers = '';
            }

            const completedList = (user.completed_providers || '').split(',').filter(Boolean);

            if (user.daily_task_count >= dailyLimit || completedList.length >= dailyLimit) {
                return interaction.editReply({
                    content: `🛑 Bạn đã hoàn thành toàn bộ **${dailyLimit}/${dailyLimit} lượt hôm nay**! Hãy quay lại vào ngày mai.`
                });
            }

            const token = crypto.randomBytes(16).toString('hex');
            const now = Date.now();
            const expiresAt = now + (10 * 60 * 1000);

            const baseUrl = process.env.BASE_URL || 'https://key.nbtung.id.vn';
            const rawDestinationUrl = `${baseUrl}/verify.html?token=${token}`;

            const result = await generateShortLink(rawDestinationUrl, completedList);

            if (!result) {
                return interaction.editReply({
                    content: '⚠️ **Hệ thống rút gọn link đang bảo trì hoặc hết cổng khả dụng!**\nVui lòng thử lại sau ít phút.'
                });
            }

            const { provider, shortUrl } = result;

            await db.execute({
                sql: `INSERT INTO link_sessions (token, discord_id, provider, status, created_at, expires_at) VALUES (?, ?, ?, 'PENDING', ?, ?)`,
                args: [token, userId, provider, now, expiresAt]
            });

            const embed = new EmbedBuilder()
                .setTitle('🎯 NHIỆM VỤ VƯỢT LINK KIẾM COIN')
                .setColor('#F59E0B')
                .setDescription(`Vượt link an toàn để nhận ngay **+${rewardCoins} Coin** vào tài khoản ví!`)
                .addFields(
                    { name: '📊 Tiến Độ Hôm Nay', value: `\`${user.daily_task_count}/${dailyLimit}\` lượt`, inline: true },
                    { name: '🌐 Cổng Vượt Link', value: `\`${provider}\``, inline: true },
                    { name: '⏳ Thời Hạn Link', value: '`10 Phút`', inline: true },
                    { name: '💡 Hướng Dẫn', value: 'Sau khi vượt link xong và nhận mã Key trên Web, bấm nút **🎁 Nhập Mã Key** bên dưới để nhận thưởng.', inline: false }
                )
                .setFooter({ text: 'Nghiêm cấm dùng tool bypass để tránh bị khóa tài khoản' });

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

        } catch (err) {
            console.error('❌ Lỗi thực thi /nhiemvu:', err);
            return interaction.editReply({ content: '⚠️ Đã xảy ra sự cố khi tạo nhiệm vụ, vui lòng thử lại!' });
        }
    }
};