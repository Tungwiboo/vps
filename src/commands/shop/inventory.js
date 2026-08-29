const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Xem kho đồ, các mã Key và hóa đơn bạn đã mua'),

    async execute(interaction) {
        const userId = interaction.user.id;

        const itemsRes = await db.execute({
            sql: 'SELECT * FROM user_inventory WHERE discord_id = ? ORDER BY id DESC LIMIT 10',
            args: [userId]
        });
        const items = itemsRes.rows;

        if (items.length === 0) {
            return interaction.reply({
                content: '🎒 Túi đồ và lịch sử mua sắm của bạn đang trống! Hãy dùng lệnh `/shop` để mua sắm nhé.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`🎒 KHO ĐỒ & HÓA ĐƠN: ${interaction.user.username}`)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setColor('#06B6D4')
            .setDescription('Dưới đây là danh sách các mặt hàng và mã hóa đơn bạn đã mua gần nhất:');

        items.forEach((item, index) => {
            embed.addFields({
                name: `${index + 1}. 🧾 ${item.item_name} (Mã HĐ: \`${item.invoice_id || 'N/A'}\`)`,
                value: `• **Giá mua:** \`${item.price || 0} Coin\`\n• **Dữ liệu / Key:** \`${item.item_data}\`\n• **Ngày mua:** \`${new Date(item.created_at).toLocaleDateString('vi-VN')}\``,
                inline: false
            });
        });

        embed.setFooter({ text: 'Bảo mật thông tin hóa đơn và mã Key, tuyệt đối không chia sẻ cho người khác' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
};