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

function extractUserId(input) {
    if (!input) return null;
    const cleanId = input.replace(/[<@!>]/g, '').trim();
    return /^\d{17,20}$/.test(cleanId) ? cleanId : null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Bảng điều khiển & Quản trị hệ thống')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub.setName('panel').setDescription('Mở Menu Dashboard Admin trực quan'))
        .addSubcommand(sub => sub.setName('info').setDescription('Tra cứu chi tiết tài khoản').addStringOption(opt => opt.setName('nguoi_dung').setDescription('Discord ID hoặc @Tag').setRequired(true)))
        .addSubcommand(sub => sub.setName('addcoin').setDescription('Cộng Coin cho thành viên').addStringOption(opt => opt.setName('nguoi_dung').setDescription('Discord ID hoặc @Tag').setRequired(true)).addIntegerOption(opt => opt.setName('so_coin').setDescription('Số Coin muốn cộng').setRequired(true).setMinValue(1)))
        .addSubcommand(sub => sub.setName('setcoin').setDescription('Đặt số dư Coin').addStringOption(opt => opt.setName('nguoi_dung').setDescription('Discord ID hoặc @Tag').setRequired(true)).addIntegerOption(opt => opt.setName('so_coin').setDescription('Số Coin muốn đặt').setRequired(true).setMinValue(0)))
        .addSubcommand(sub => sub.setName('resettask').setDescription('Reset lượt nhiệm vụ về 0').addStringOption(opt => opt.setName('nguoi_dung').setDescription('Discord ID hoặc @Tag').setRequired(true))),

    async execute(interaction) {
        const allowedAdmins = process.env.ADMIN_ID ? process.env.ADMIN_ID.split(',').map(id => id.trim()) : [];
        if (!allowedAdmins.includes(interaction.user.id)) {
            return interaction.reply({ content: '🚫 Bạn không có quyền truy cập Admin Hub!', ephemeral: true });
        }

        const subCommand = interaction.options.getSubcommand(false) || 'panel';

        if (subCommand === 'info') {
            const targetId = extractUserId(interaction.options.getString('nguoi_dung'));
            if (!targetId) return interaction.reply({ content: '❌ ID không hợp lệ!', ephemeral: true });

            const userRes = await db.execute({ sql: "SELECT * FROM global_users WHERE discord_id = ?", args: [targetId] });
            const targetUser = userRes.rows[0];

            if (!targetUser) return interaction.reply({ content: `❌ Không tìm thấy dữ liệu của <@${targetId}>!`, ephemeral: true });

            const invRes = await db.execute({ sql: "SELECT COUNT(*) as count FROM user_inventory WHERE discord_id = ?", args: [targetId] });

            const embed = new EmbedBuilder()
                .setTitle(`🔍 THÔNG TIN THÀNH VIÊN: ${targetUser.username}`)
                .setColor('#8B5CF6')
                .addFields(
                    { name: '🆔 Discord ID', value: `\`${targetUser.discord_id}\``, inline: true },
                    { name: '💰 Số Dư Coin', value: `**${targetUser.coin_balance.toLocaleString()}** Coin`, inline: true },
                    { name: '🎯 Nhiệm Vụ Hôm Nay', value: `\`${targetUser.daily_task_count || 0}\` lượt`, inline: true },
                    { name: '🔗 Tổng Link Đã Vượt', value: `\`${targetUser.total_links_completed || 0}\` link`, inline: true },
                    { name: '🎒 Vật Phẩm / Hóa Đơn', value: `\`${invRes.rows[0]?.count || 0}\` món`, inline: true },
                    { name: '📅 Ngày Đăng Ký', value: `\`${new Date(targetUser.created_at).toLocaleDateString('vi-VN')}\``, inline: false }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subCommand === 'addcoin') {
            const targetId = extractUserId(interaction.options.getString('nguoi_dung'));
            const amount = interaction.options.getInteger('so_coin');
            if (!targetId) return interaction.reply({ content: '❌ ID không hợp lệ!', ephemeral: true });

            await db.execute({
                sql: "INSERT INTO global_users (discord_id, username, coin_balance) VALUES (?, 'User', ?) ON CONFLICT(discord_id) DO UPDATE SET coin_balance = coin_balance + ?",
                args: [targetId, amount, amount]
            });

            return interaction.reply({ content: `✅ Đã cộng **+${amount.toLocaleString()} Coin** cho <@${targetId}>!`, ephemeral: true });
        }

        if (subCommand === 'setcoin') {
            const targetId = extractUserId(interaction.options.getString('nguoi_dung'));
            const amount = interaction.options.getInteger('so_coin');
            if (!targetId) return interaction.reply({ content: '❌ ID không hợp lệ!', ephemeral: true });

            await db.execute({
                sql: "INSERT INTO global_users (discord_id, username, coin_balance) VALUES (?, 'User', ?) ON CONFLICT(discord_id) DO UPDATE SET coin_balance = ?",
                args: [targetId, amount, amount]
            });

            return interaction.reply({ content: `✅ Đã đặt số dư của <@${targetId}> thành **${amount.toLocaleString()} Coin**!`, ephemeral: true });
        }

        if (subCommand === 'resettask') {
            const targetId = extractUserId(interaction.options.getString('nguoi_dung'));
            if (!targetId) return interaction.reply({ content: '❌ ID không hợp lệ!', ephemeral: true });

            const today = new Date().toISOString().split('T')[0];
            await db.execute({
                sql: "UPDATE global_users SET daily_task_count = 0, last_task_date = ? WHERE discord_id = ?",
                args: [today, targetId]
            });

            return interaction.reply({ content: `✅ Đã reset nhiệm vụ hôm nay của <@${targetId}> về 0!`, ephemeral: true });
        }

        // PANEL TỔNG
        await interaction.deferReply({ ephemeral: true });

        const userCountRes = await db.execute("SELECT COUNT(*) as total_users, SUM(coin_balance) as total_coins, SUM(total_links_completed) as total_links FROM global_users");
        const settingsRes = await db.execute("SELECT * FROM system_settings");
        const shopRes = await db.execute("SELECT COUNT(*) as total_items FROM shop_items WHERE is_active = 1");

        const stats = userCountRes.rows[0] || {};
        const settings = {};
        settingsRes.rows.forEach(row => settings[row.setting_key] = row.setting_value);

        const mainEmbed = new EmbedBuilder()
            .setTitle('⚡ BẢNG ĐIỀU KHIỂN HỆ THỐNG (ADMIN HUB)')
            .setColor('#6366F1')
            .setDescription('Chào mừng Admin! Dưới đây là thống kê thời gian thực của bot:')
            .addFields(
                { 
                    name: '📊 Thống Kê Tổng Quan', 
                    value: `• **Người Dùng:** \`${stats.total_users || 0}\` người\n• **Tổng Coin:** \`${(stats.total_coins || 0).toLocaleString()}\` Coin\n• **Tổng Link Vượt:** \`${stats.total_links || 0}\` link\n• **Mặt Hàng Shop:** \`${shopRes.rows[0]?.total_items || 0}\` món`, 
                    inline: true 
                },
                { 
                    name: '⚙️ Cấu Hình Kinh Tế', 
                    value: `• **Thưởng Vượt Link:** \`+${settings.task_reward_coins || 50}\` Coin\n• **Giới Hạn Vượt:** \`${settings.daily_task_limit || 3}\` lần/ngày\n• **Phí Chuyển (/pay):** \`${settings.trade_fee_percent || 5}%\``, 
                    inline: true 
                }
            )
            .setFooter({ text: 'Hệ thống vận hành đám mây Turso 24/7' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_menu_select')
            .setPlaceholder('👉 Chọn chức năng quản trị...')
            .addOptions([
                { label: 'Danh Sách Top User', value: 'view_users', description: 'Xem Top người dùng nhiều coin & link nhất', emoji: '👥' },
                { label: 'Cấu Hình Hệ Thống', value: 'config_system', description: 'Đổi coin thưởng, giới hạn link/ngày, phí chuyển tiền', emoji: '⚙️' },
                { label: 'Tạo Key Nhận Thưởng', value: 'create_key', description: 'Tạo mã Key nhận Coin hoặc gán Role VIP', emoji: '🔑' },
                { label: 'Thêm Mặt Hàng Vào Shop', value: 'manage_shop', description: 'Thêm gói ROLE_VIP, Acc DM, Thẻ Game...', emoji: '🛒' }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        const replyMessage = await interaction.editReply({ embeds: [mainEmbed], components: [row] });

        const collector = replyMessage.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) return;
            const selected = i.values[0];

            if (selected === 'view_users') {
                const usersRes = await db.execute("SELECT discord_id, username, coin_balance, total_links_completed FROM global_users ORDER BY coin_balance DESC LIMIT 10");
                const list = usersRes.rows.map((u, idx) => 
                    `**#${idx + 1}** <@${u.discord_id}> (\`${u.username}\`)\n└ 💰 **${u.coin_balance.toLocaleString()}** Coin | 🔗 Đã vượt: **${u.total_links_completed || 0}** link`
                ).join('\n\n') || 'Chưa có người dùng.';

                const userEmbed = new EmbedBuilder()
                    .setTitle('👥 TOP 10 NGƯỜI DÙNG NHIỀU COIN & VƯỢT LINK')
                    .setColor('#10B981')
                    .setDescription(list);

                await i.reply({ embeds: [userEmbed], ephemeral: true });
            }
            else if (selected === 'config_system') {
                const modal = new ModalBuilder().setCustomId('modal_config_system').setTitle('⚙️ Cấu Hình Kinh Tế');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cfg_reward').setLabel('Coin nhận khi vượt 1 link:').setStyle(TextInputStyle.Short).setValue(settings.task_reward_coins || '50').setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cfg_limit').setLabel('Số link tối đa/ngày:').setStyle(TextInputStyle.Short).setValue(settings.daily_task_limit || '3').setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cfg_fee').setLabel('Phí sàn chuyển tiền /pay (%):').setStyle(TextInputStyle.Short).setValue(settings.trade_fee_percent || '5').setRequired(true))
                );
                await i.showModal(modal);
            }
            else if (selected === 'create_key') {
                const modal = new ModalBuilder().setCustomId('modal_create_key').setTitle('🔑 Tạo Key Nhận Thưởng');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_type').setLabel('Loại Key: COIN hoặc ROLE_VIP').setValue('COIN').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_value').setLabel('Số Coin (nếu COIN) hoặc Role ID (nếu ROLE):').setPlaceholder('Ví dụ: 100 hoặc 123456789012345678').setStyle(TextInputStyle.Short).setRequired(true))
                );
                await i.showModal(modal);
            }
            else if (selected === 'manage_shop') {
                const modal = new ModalBuilder().setCustomId('modal_add_shop_item').setTitle('🛒 Thêm Vật Phẩm Mới Vào Shop');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_id').setLabel('Mã sản phẩm (duy nhất, viết liền):').setPlaceholder('vd: role_vip_1thang, acc_game').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_name').setLabel('Tên hiển thị:').setPlaceholder('Ví dụ: 👑 Role VIP Trọn Đời').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_price').setLabel('Giá bán (Coin):').setPlaceholder('500').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_reward_type').setLabel('Loại: ROLE_VIP / DM_ACCOUNT / MANUAL_ADMIN').setPlaceholder('ROLE_VIP: Tự cấp role | DM_ACCOUNT: Bot gửi DM').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_reward_data').setLabel('Role ID (nếu ROLE_VIP) hoặc dữ liệu gửi DM:').setPlaceholder('Nhập Discord Role ID (dãy số) hoặc tài khoản mật khẩu').setStyle(TextInputStyle.Paragraph).setRequired(true))
                );
                await i.showModal(modal);
            }
        });
    }
};