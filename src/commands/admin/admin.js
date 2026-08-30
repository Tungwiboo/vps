const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Bảng điều khiển quản trị hệ thống (Admin Control Center)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Kiểm tra quyền Admin
        const allowedAdmins = process.env.ADMIN_ID ? process.env.ADMIN_ID.split(',').map(id => id.trim()) : [];
        const isOwner = allowedAdmins.includes(interaction.user.id);
        const hasAdminPerm = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

        if (!isOwner && !hasAdminPerm) {
            return interaction.reply({ content: '🚫 Bạn không có quyền truy cập Admin Control Center!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Lấy dữ liệu thống kê từ Turso
            const [userStats, shopStats, keyStats, settingsRes] = await Promise.all([
                db.execute("SELECT COUNT(*) as total_users, SUM(coin_balance) as total_coins, SUM(total_links_completed) as total_links, SUM(daily_task_count) as tasks_today FROM global_users"),
                db.execute("SELECT COUNT(*) as total_items FROM shop_items WHERE is_active = 1"),
                db.execute("SELECT COUNT(*) as total_keys, SUM(CASE WHEN is_used = 1 THEN 1 ELSE 0 END) as used_keys FROM claim_keys"),
                db.execute("SELECT setting_key, setting_value FROM system_settings")
            ]);

            const settings = {};
            settingsRes.rows.forEach(r => settings[r.setting_key] = r.setting_value);

            const u = userStats.rows[0] || {};
            const totalUsers = u.total_users || 0;
            const totalCoins = u.total_coins || 0;
            const totalLinks = u.total_links || 0;
            const tasksToday = u.tasks_today || 0;
            const totalItems = shopStats.rows[0]?.total_items || 0;
            const totalKeys = keyStats.rows[0]?.total_keys || 0;
            const usedKeys = keyStats.rows[0]?.used_keys || 0;

            const embed = new EmbedBuilder()
                .setTitle('⚡ BẢNG ĐIỀU KHIỂN HỆ THỐNG (ADMIN HUB)')
                .setColor('#6366F1')
                .setDescription('Trung tâm quản trị toàn diện: Kinh tế, Thành viên, Cửa hàng & Cấu hình.')
                .setThumbnail(interaction.guild?.iconURL({ dynamic: true }) || interaction.client.user.displayAvatarURL())
                .addFields(
                    {
                        name: '👥 Người Dùng & Nhiệm Vụ',
                        value: `• Tổng User: **${totalUsers.toLocaleString()}**\n• Lượt vượt hôm nay: **${tasksToday.toLocaleString()}**\n• Tổng link đã vượt: **${totalLinks.toLocaleString()}**`,
                        inline: true
                    },
                    {
                        name: '💰 Kinh Tế Lưu Hành',
                        value: `• Tổng Coin thị trường: **${totalCoins.toLocaleString()}**\n• Thưởng nhiệm vụ: **${settings.task_reward_coins || 50}** Coin\n• Phí chuyển (/pay): **${settings.trade_fee_percent || 5}%**`,
                        inline: true
                    },
                    {
                        name: '🛒 Cửa Hàng & Key',
                        value: `• Mặt hàng mở bán: **${totalItems}** món\n• Mã Key đã cấp: **${totalKeys}**\n• Key đã kích hoạt: **${usedKeys}**`,
                        inline: true
                    },
                    {
                        name: '⚙️ Cấu Hình Mặc Định',
                        value: `• Giới hạn vượt: **${settings.daily_task_limit || 3}** lượt/ngày | Chống Bypass: **40 Giây** | Token: **10 Phút**`,
                        inline: false
                    }
                )
                .setFooter({ text: 'Nhấn các nút bên dưới để mở form thao tác trực tiếp' })
                .setTimestamp();

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_adm_coins')
                    .setLabel('💰 Chỉnh Sửa Coin')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('btn_adm_member')
                    .setLabel('👤 Quản Lý Thành Viên')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('btn_adm_add_shop')
                    .setLabel('➕ Thêm Đồ Shop')
                    .setStyle(ButtonStyle.Success)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_adm_create_key')
                    .setLabel('🔑 Tạo Mã Key')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('btn_adm_settings')
                    .setLabel('⚙️ Đổi Cấu Hình')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('btn_adm_refresh')
                    .setLabel('🔄 Làm Mới')
                    .setStyle(ButtonStyle.Secondary)
            );

            return interaction.editReply({ embeds: [embed], components: [row1, row2] });

        } catch (error) {
            console.error('❌ Lỗi tại /admin:', error);
            return interaction.editReply({ content: '⚠️ Đã xảy ra lỗi khi tải Dashboard Admin!' });
        }
    }
};