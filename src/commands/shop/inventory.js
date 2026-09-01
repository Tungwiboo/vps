const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Xem kho đồ, các mã Key đã mua và lịch sử hóa đơn'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const userId = interaction.user.id;

        const itemsRes = await db.execute({
            sql: 'SELECT * FROM user_inventory WHERE discord_id = ? ORDER BY id DESC LIMIT 10',
            args: [userId]
        });
        const items = itemsRes.rows;

        if (items.length === 0) {
            return interaction.editReply({
                content: '🎒 Túi đồ của bạn đang trống! Hãy ghé `/shop` để mua sắm nhé.'
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`🎒 KHO ĐỒ & HÓA ĐƠN: ${interaction.user.username}`)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setColor('#06B6D4')
            .setDescription('Dưới đây là 10 mặt hàng & hóa đơn gần nhất bạn đang sở hữu:');

        items.forEach((item, index) => {
            embed.addFields({
                name: `\`#${index + 1}\` 🧾 ${item.item_name} | HĐ: \`${item.invoice_id || 'N/A'}\``,
                value: `> 💰 **Giá mua:** \`${item.price || 0} Coin\`\n> 📦 **Nội dung / Key:** \`${item.item_data}\`\n> 📅 **Ngày mua:** \`${new Date(item.created_at).toLocaleDateString('vi-VN')}\``,
                inline: false
            });
        });

        embed.setFooter({ text: 'Bảo mật các mã Key cẩn thận, không chia sẻ cho người khác' });

        return interaction.editReply({ embeds: [embed] });
    }
};