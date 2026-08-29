const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Xem hồ sơ cá nhân và số dư Coin'),

    async execute(interaction) {
        const userId = interaction.user.id;
        let user = db.prepare('SELECT * FROM global_users WHERE discord_id = ?').get(userId);

        if (!user) {
            return interaction.reply({
                content: '⚠️ Bạn chưa liên kết tài khoản! Hãy dùng lệnh `/link` trước.',
                ephemeral: true
            });
        }

        const today = new Date().toISOString().split('T')[0];
        if (user.last_task_date !== today) {
            db.prepare('UPDATE global_users SET daily_task_count = 0, completed_providers = "", last_task_date = ? WHERE discord_id = ?').run(today, userId);
            user.daily_task_count = 0;
            user.completed_providers = '';
        }

        const embed = new EmbedBuilder()
            .setTitle(`👤 Hồ Sơ Người Dùng: ${user.username}`)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setColor('#3B82F6')
            .addFields(
                { name: '🆔 Discord ID', value: `\`${user.discord_id}\``, inline: true },
                { name: '💰 Số Dư Coin', value: `**${user.coin_balance.toLocaleString()}** Coin`, inline: true },
                { name: '🎯 Nhiệm Vụ Hôm Nay', value: `\`${user.daily_task_count}/3\` lượt`, inline: true },
                { name: '📅 Ngày Tham Gia', value: new Date(user.created_at).toLocaleDateString('vi-VN'), inline: false }
            )
            .setFooter({ text: 'Dữ liệu tài khoản đồng bộ toàn cục' });

        return interaction.reply({ embeds: [embed] });
    }
};