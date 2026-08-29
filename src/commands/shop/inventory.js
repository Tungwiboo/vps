const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Xem kho đồ và các mã Key bản quyền bạn đang sở hữu'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const items = db.prepare('SELECT * FROM user_inventory WHERE discord_id = ? ORDER BY id DESC LIMIT 10').all(userId);

        if (items.length === 0) {
            return interaction.reply({
                content: '🎒 Túi đồ của bạn đang trống! Hãy dùng lệnh `/shop` để mua Key.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`🎒 Kho Đồ Cá Nhân: ${interaction.user.username}`)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setColor('#06B6D4')
            .setDescription('Dưới đây là các mã Key VIP gần nhất bạn đang sở hữu:');

        items.forEach((item, index) => {
            embed.addFields({
                name: `${index + 1}. ${item.item_name}`,
                value: `🔑 Mã Key: \`${item.item_data}\`\n📅 Ngày mua: \`${new Date(item.created_at).toLocaleDateString('vi-VN')}\``,
                inline: false
            });
        });

        embed.setFooter({ text: 'Bảo mật mã Key cẩn thận, không chia sẻ cho người khác' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
};