const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Cửa hàng quy đổi Coin lấy Key bản quyền và đặc quyền'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const user = db.prepare('SELECT * FROM global_users WHERE discord_id = ?').get(userId);

        if (!user) {
            return interaction.reply({ content: '⚠️ Hãy dùng lệnh `/link` để kích hoạt tài khoản trước!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🛒 Cửa Hàng Vật Phẩm & Key VIP')
            .setColor('#8B5CF6')
            .setDescription(`Số dư hiện tại của bạn: **${user.coin_balance.toLocaleString()} Coin**\n` +
                            `Chọn một gói vật phẩm bên dưới menu để quy đổi:`)
            .addFields(
                { name: '🔑 Key VIP Tool (1 Ngày)', value: 'Giá: `100 Coin`', inline: true },
                { name: '🔑 Key VIP Tool (7 Ngày)', value: 'Giá: `500 Coin`', inline: true },
                { name: '👑 Key VIP Tool (30 Ngày)', value: 'Giá: `1.500 Coin`', inline: true }
            )
            .setFooter({ text: 'Key mua thành công sẽ được lưu trữ trong /inventory' });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_shop_item')
            .setPlaceholder('Chọn gói Key bạn muốn mua...')
            .addOptions([
                {
                    label: 'Key VIP Tool (1 Ngày)',
                    description: 'Giá: 100 Coin - Gói trải nghiệm',
                    value: 'key_1day_100',
                    emoji: '🔑'
                },
                {
                    label: 'Key VIP Tool (7 Ngày)',
                    description: 'Giá: 500 Coin - Tiết kiệm 200 Coin',
                    value: 'key_7days_500',
                    emoji: '🔑'
                },
                {
                    label: 'Key VIP Tool (30 Ngày)',
                    description: 'Giá: 1.500 Coin - Trọn gói tháng VIP',
                    value: 'key_30days_1500',
                    emoji: '👑'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
};