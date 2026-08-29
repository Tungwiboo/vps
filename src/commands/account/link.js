const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Kích hoạt tài khoản Discord'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.username;

        const checkUserRes = await db.execute({
            sql: 'SELECT * FROM global_users WHERE discord_id = ?',
            args: [userId]
        });
        const checkUser = checkUserRes.rows[0];

        if (checkUser) {
            return interaction.reply({
                content: `⚠️ Discord ID \`${userId}\` đã được kích hoạt trước đó.`,
                ephemeral: true
            });
        }

        await db.execute({
            sql: 'INSERT INTO global_users (discord_id, username, coin_balance) VALUES (?, ?, 0)',
            args: [userId, username]
        });

        const embed = new EmbedBuilder()
            .setTitle('🎉 Kích Hoạt Tài Khoản Thành Công')
            .setColor('#10B981')
            .setDescription('Tài khoản của bạn đã được kích hoạt.')
            .addFields(
                { name: '🆔 Discord ID Số', value: `\`${userId}\``, inline: true },
                { name: '👤 Tên Tài Khoản', value: username, inline: true },
                { name: '💰 Số Dư Khởi Tạo', value: '`0 Coin`', inline: true }
            )
            .setFooter({ text: 'Dữ liệu được cập nhật tự động.' });

        return interaction.reply({ embeds: [embed] });
    }
};