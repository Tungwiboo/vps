const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Xem hồ sơ cá nhân, số dư Coin và các đặc quyền'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.user.id;

        const userRes = await db.execute({
            sql: 'SELECT * FROM global_users WHERE discord_id = ?',
            args: [userId]
        });
        let user = userRes.rows[0];

        if (!user) {
            return interaction.editReply({ content: '⚠️ Bạn chưa kích hoạt tài khoản! Hãy dùng `/link` trước.' });
        }

        const today = new Date().toISOString().split('T')[0];
        if (user.last_task_date !== today) {
            await db.execute({
                sql: "UPDATE global_users SET daily_task_count = 0, completed_providers = '', last_task_date = ? WHERE discord_id = ?",
                args: [today, userId]
            });
            user.daily_task_count = 0;
            user.completed_providers = '';
        }

        const invRes = await db.execute({
            sql: 'SELECT COUNT(*) as count FROM user_inventory WHERE discord_id = ?',
            args: [userId]
        });

        const embed = new EmbedBuilder()
            .setTitle(`👤 HỒ SƠ CÁ NHÂN: ${user.username}`)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setColor('#3B82F6')
            .addFields(
                { name: '🆔 Discord ID', value: `\`${user.discord_id}\``, inline: true },
                { name: '💰 Số Dư Coin', value: `**${user.coin_balance.toLocaleString()}** Coin`, inline: true },
                { name: '🎯 Nhiệm Vụ Hôm Nay', value: `\`${user.daily_task_count || 0}/3\` lượt`, inline: true },
                { name: '🔗 Tổng Link Đã Vượt', value: `\`${user.total_links_completed || 0}\` link`, inline: true },
                { name: '🎒 Vật Phẩm Sở Hữu', value: `\`${invRes.rows[0]?.count || 0}\` món`, inline: true },
                { name: '📅 Ngày Tham Gia', value: `\`${new Date(user.created_at).toLocaleDateString('vi-VN')}\``, inline: true }
            )
            .setFooter({ text: 'Dữ liệu được cập nhật theo thời gian thực' })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
};