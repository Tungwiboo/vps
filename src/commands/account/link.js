const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Kích hoạt tài khoản ví Discord trên hệ thống toàn cục'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.user.id;
        const username = interaction.user.username;

        const checkUserRes = await db.execute({
            sql: 'SELECT * FROM global_users WHERE discord_id = ?',
            args: [userId]
        });
        const checkUser = checkUserRes.rows[0];

        if (checkUser) {
            return interaction.editReply({ content: `⚠️ Tài khoản Discord <@${userId}> đã được kích hoạt từ trước!` });
        }

        await db.execute({
            sql: 'INSERT INTO global_users (discord_id, username, coin_balance) VALUES (?, ?, 0)',
            args: [userId, username]
        });

        const embed = new EmbedBuilder()
            .setTitle('🎉 KÍCH HOẠT TÀI KHOẢN THÀNH CÔNG')
            .setColor('#10B981')
            .setDescription('Tài khoản của bạn đã được kết nối với cơ sở dữ liệu đám mây.')
            .addFields(
                { name: '🆔 Discord ID', value: `\`${userId}\``, inline: true },
                { name: '👤 Tên Người Dùng', value: username, inline: true },
                { name: '💰 Số Dư Khởi Tạo', value: '`0 Coin`', inline: true }
            )
            .setFooter({ text: 'Dùng /nhiemvu để bắt đầu kiếm Coin' })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
};