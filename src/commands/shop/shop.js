const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Cửa hàng quy đổi Coin lấy mã Redeem Role VIP, Role Độc Quyền'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.user.id;

        const userRes = await db.execute({
            sql: 'SELECT * FROM global_users WHERE discord_id = ?',
            args: [userId]
        });
        const user = userRes.rows[0];

        if (!user) {
            return interaction.editReply({ content: '⚠️ Bạn chưa kích hoạt tài khoản! Hãy dùng `/link` trước.' });
        }

        const itemsRes = await db.execute("SELECT * FROM shop_items WHERE is_active = 1");
        const items = itemsRes.rows;

        if (items.length === 0) {
            return interaction.editReply({ content: '🛒 Hiện cửa hàng chưa có mặt hàng nào được mở bán!' });
        }

        const shopEmbed = new EmbedBuilder()
            .setTitle('💎 TRUNG TÂM QUY ĐỔI MÃ KEY ROLE & VẬT PHẨM')
            .setColor('#7C3AED')
            .setDescription(`✨ Xin chào **${interaction.user.username}**!\n💰 Số dư ví của bạn: **${user.coin_balance.toLocaleString()} Coin**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n*Chọn gói sản phẩm bạn muốn đổi từ danh sách bên dưới:*`)
            .setFooter({ text: 'Mã Redeem sẽ được tạo riêng và khóa độc quyền theo ID của bạn' })
            .setTimestamp();

        const selectOptions = [];
        items.forEach((item, index) => {
            let typeBadge = '🔑 Mã Redeem Cấp Role';
            if (item.reward_type === 'DM_ACCOUNT') typeBadge = '📦 Tài Khoản Tự Động';

            shopEmbed.addFields({
                name: `\`#${index + 1}\` ${item.item_name} — 💰 ${item.price.toLocaleString()} Coin`,
                value: `> 🏷️ **Phân loại:** \`${typeBadge}\`\n> 📝 **Mô tả:** *${item.description || 'Vật phẩm VIP đặc quyền.'}*`,
                inline: false
            });

            selectOptions.push({
                label: item.item_name.substring(0, 50),
                description: `Giá: ${item.price.toLocaleString()} Coin`,
                value: item.item_id,
                emoji: item.reward_type.includes('ROLE') ? '👑' : '🎁'
            });
        });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_shop_checkout')
                .setPlaceholder('👉 Chọn gói muốn đổi Redeem Code...')
                .addOptions(selectOptions)
        );

        return interaction.editReply({ embeds: [shopEmbed], components: [row] });
    }
};