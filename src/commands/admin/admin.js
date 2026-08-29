const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    PermissionFlagsBits 
} = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Bảng điều khiển quản trị viên (Admin Dashboard Hub)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const allowedAdmins = process.env.ADMIN_ID ? process.env.ADMIN_ID.split(',').map(id => id.trim()) : [];
        if (!allowedAdmins.includes(interaction.user.id)) {
            return interaction.reply({ content: '🚫 Bạn không có quyền truy cập Admin Hub!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const userCountRes = await db.execute("SELECT COUNT(*) as total_users, SUM(coin_balance) as total_coins, SUM(total_links_completed) as total_links FROM global_users");
        const settingsRes = await db.execute("SELECT * FROM system_settings");
        const shopRes = await db.execute("SELECT COUNT(*) as total_items FROM shop_items WHERE is_active = 1");

        const stats = userCountRes.rows[0];
        const settings = {};
        settingsRes.rows.forEach(row => settings[row.setting_key] = row.setting_value);

        const mainEmbed = new EmbedBuilder()
            .setTitle('⚡ BẢNG ĐIỀU KHIỂN HỆ THỐNG (ADMIN HUB)')
            .setColor('#6366F1')
            .setDescription('Chào mừng Admin! Chọn danh mục từ menu bên dưới để quản lý toàn bộ hệ thống:')
            .addFields(
                { 
                    name: '📊 Thống Kê Tổng Quan', 
                    value: `• **Người Dùng:** \`${stats.total_users || 0}\` thành viên\n• **Tổng Coin Lưu Thông:** \`${(stats.total_coins || 0).toLocaleString()}\` Coin\n• **Tổng Lượt Vượt Link:** \`${stats.total_links || 0}\` lượt\n• **Vật Phẩm Trong Shop:** \`${shopRes.rows[0]?.total_items || 0}\` món`, 
                    inline: true 
                },
                { 
                    name: '⚙️ Cấu Hình Kinh Tế', 
                    value: `• **Thưởng 1 Lần Vượt:** \`+${settings.task_reward_coins || 50}\` Coin\n• **Giới Hạn Vượt:** \`${settings.daily_task_limit || 3}\` lần/ngày\n• **Phí Sàn Trade (/pay):** \`${settings.trade_fee_percent || 5}%\``, 
                    inline: true 
                }
            )
            .setFooter({ text: 'Dữ liệu được lưu trữ trực tiếp trên đám mây Turso 24/7' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_menu_select')
            .setPlaceholder('👉 Chọn chức năng muốn quản lý...')
            .addOptions([
                { label: 'Danh Sách & Soi User', value: 'view_users', description: 'Xem chi tiết User, số coin và tổng link đã vượt', emoji: '👥' },
                { label: 'Cấu Hình Hệ Thống', value: 'config_system', description: 'Chỉnh số coin thưởng, giới hạn link/ngày, phí chuyển coin', emoji: '⚙️' },
                { label: 'Tạo Key / Link Nhận Coin', value: 'create_key', description: 'Tạo mã Key nhận thưởng cho thành viên', emoji: '🔑' },
                { label: 'Thêm Vật Phẩm Vào Shop', value: 'manage_shop', description: 'Thêm hàng tự động qua DM, vé VIP, duyệt tay...', emoji: '🛒' },
                { label: 'Cấp Đặc Quyền VIP Trực Tiếp', value: 'grant_perk', description: 'Cấp vé miễn phí minigame, miễn phí chuyển tiền...', emoji: '👑' }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        const replyMessage = await interaction.editReply({ embeds: [mainEmbed], components: [row] });

        const collector = replyMessage.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) return;
            const selected = i.values[0];

            if (selected === 'view_users') {
                const usersRes = await db.execute("SELECT discord_id, username, coin_balance, total_links_completed, created_at FROM global_users ORDER BY coin_balance DESC LIMIT 10");
                const list = usersRes.rows.map((u, idx) => 
                    `**#${idx + 1}** <@${u.discord_id}> (\`${u.username}\`)\n└ 💰 **${u.coin_balance.toLocaleString()}** Coin | 🔗 Đã vượt: **${u.total_links_completed || 0}** link`
                ).join('\n\n') || 'Chưa có dữ liệu người dùng.';

                const userEmbed = new EmbedBuilder()
                    .setTitle('👥 TOP 10 NGƯỜI DÙNG NHIỀU COIN & VƯỢT LINK NHẤT')
                    .setColor('#10B981')
                    .setDescription(list);

                await i.reply({ embeds: [userEmbed], ephemeral: true });
            }
            else if (selected === 'config_system') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_config_system')
                    .setTitle('⚙️ Cấu Hình Kinh Tế & Vượt Link');

                const rewardInput = new TextInputBuilder()
                    .setCustomId('cfg_reward')
                    .setLabel('Số Coin nhận khi vượt 1 link:')
                    .setStyle(TextInputStyle.Short)
                    .setValue(settings.task_reward_coins || '50')
                    .setRequired(true);

                const limitInput = new TextInputBuilder()
                    .setCustomId('cfg_limit')
                    .setLabel('Số link tối đa được vượt/ngày:')
                    .setStyle(TextInputStyle.Short)
                    .setValue(settings.daily_task_limit || '3')
                    .setRequired(true);

                const feeInput = new TextInputBuilder()
                    .setCustomId('cfg_fee')
                    .setLabel('Phí chuyển tiền /pay (%):')
                    .setStyle(TextInputStyle.Short)
                    .setValue(settings.trade_fee_percent || '5')
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(rewardInput),
                    new ActionRowBuilder().addComponents(limitInput),
                    new ActionRowBuilder().addComponents(feeInput)
                );

                await i.showModal(modal);
            }
            else if (selected === 'create_key') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_create_key')
                    .setTitle('🔑 Tạo Key Nhận Thưởng Coin');

                const coinsInput = new TextInputBuilder()
                    .setCustomId('key_coins')
                    .setLabel('Số Coin người nhập nhận được:')
                    .setPlaceholder('Ví dụ: 100')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(coinsInput));
                await i.showModal(modal);
            }
            else if (selected === 'manage_shop') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_add_shop_item')
                    .setTitle('🛒 Thêm Vật Phẩm Mới Vào Shop');

                const idInput = new TextInputBuilder()
                    .setCustomId('item_id')
                    .setLabel('Mã sản phẩm (duy nhất, viết liền):')
                    .setPlaceholder('vd: acc_netflix, key_tool_vip')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const nameInput = new TextInputBuilder()
                    .setCustomId('item_name')
                    .setLabel('Tên hiển thị:')
                    .setPlaceholder('Ví dụ: Key VIP Tool 30 Ngày')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const priceInput = new TextInputBuilder()
                    .setCustomId('item_price')
                    .setLabel('Giá bán (Coin):')
                    .setPlaceholder('200')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const typeInput = new TextInputBuilder()
                    .setCustomId('item_reward_type')
                    .setLabel('Loại: DM_ACCOUNT / MANUAL_ADMIN / PERK_PASS')
                    .setPlaceholder('DM_ACCOUNT: Bot gửi DM | MANUAL_ADMIN: Duyệt tay')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const dataInput = new TextInputBuilder()
                    .setCustomId('item_reward_data')
                    .setLabel('Dữ liệu bàn giao (Tài khoản/Key hoặc số ngày):')
                    .setPlaceholder('user: pass | key-1234 (Hoặc số ngày nếu là PERK_PASS)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(idInput),
                    new ActionRowBuilder().addComponents(nameInput),
                    new ActionRowBuilder().addComponents(priceInput),
                    new ActionRowBuilder().addComponents(typeInput),
                    new ActionRowBuilder().addComponents(dataInput)
                );

                await i.showModal(modal);
            }
            else if (selected === 'grant_perk') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_grant_perk')
                    .setTitle('👑 Cấp Đặc Quyền VIP Cho Thành Viên');

                const targetInput = new TextInputBuilder()
                    .setCustomId('perk_target')
                    .setLabel('Discord ID người nhận:')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const perkTypeInput = new TextInputBuilder()
                    .setCustomId('perk_type')
                    .setLabel('Loại: FREE_GAME (Chơi free game) / NO_FEE_TRADE')
                    .setValue('FREE_GAME')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const daysInput = new TextInputBuilder()
                    .setCustomId('perk_days')
                    .setLabel('Thời hạn (Số ngày):')
                    .setValue('7')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(targetInput),
                    new ActionRowBuilder().addComponents(perkTypeInput),
                    new ActionRowBuilder().addComponents(daysInput)
                );

                await i.showModal(modal);
            }
        });
    }
};