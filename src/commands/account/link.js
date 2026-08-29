const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Liên kết tài khoản Discord vào hệ thống toàn cục'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.username;

        const checkUser = db.prepare('SELECT * FROM global_users WHERE discord_id = ?').get(userId);
        if (checkUser) {
            return interaction.reply({
                content: `⚠️ Discord ID \`${userId}\` đã được liên kết trong hệ thống từ trước!`,
                ephemeral: true
            });
        }

        db.prepare('INSERT INTO global_users (discord_id, username, coin_balance) VALUES (?, ?, 0)').run(userId, username);

        const embed = new EmbedBuilder()
            .setTitle('🎉 Liên Kết Tài Khoản Thành Công')
            .setColor('#10B981')
            .setDescription('Tài khoản của bạn đã được kích hoạt trên hệ thống toàn cục.')
            .addFields(
                { name: '🆔 Discord ID Số', value: `\`${userId}\``, inline: true },
                { name: '👤 Tên Tài Khoản', value: username, inline: true },
                { name: '💰 Số Dư Khởi Tạo', value: '`0 Coin`', inline: true }
            )
            .setFooter({ text: 'Dữ liệu đồng bộ trên tất cả server của Bot' });

        return interaction.reply({ embeds: [embed] });
    }
};