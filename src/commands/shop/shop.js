const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const crypto = require('crypto');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Cửa hàng quy đổi Coin lấy vật phẩm, mã Key và đặc quyền VIP'),

    async execute(interaction) {
        const userId = interaction.user.id;

        const userRes = await db.execute({
            sql: 'SELECT * FROM global_users WHERE discord_id = ?',
            args: [userId]
        });
        const user = userRes.rows[0];

        if (!user) {
            return interaction.reply({ content: '⚠️ Bạn chưa liên kết tài khoản! Hãy dùng `/link` trước.', ephemeral: true });
        }

        const itemsRes = await db.execute("SELECT * FROM shop_items WHERE is_active = 1");
        const items = itemsRes.rows;

        if (items.length === 0) {
            return interaction.reply({ content: '🛒 Hiện cửa hàng chưa có mặt hàng nào được mở bán!', ephemeral: true });
        }

        const shopEmbed = new EmbedBuilder()
            .setTitle('🛒 CỬA HÀNG VẬT PHẨM & ĐẶC QUYỀN VIP')
            .setColor('#8B5CF6')
            .setDescription(`Xin chào **${interaction.user.username}**!\nSố dư ví của bạn: **${user.coin_balance.toLocaleString()} Coin**\n\n*Chọn một mặt hàng từ menu bên dưới để mua trực tiếp:*`)
            .setFooter({ text: 'Hóa đơn chi tiết sẽ được tự động gửi qua tin nhắn riêng (DM)' })
            .setTimestamp();

        const selectOptions = [];

        items.forEach((item, index) => {
            let typeBadge = '📦 Tự động qua DM';
            if (item.reward_type === 'MANUAL_ADMIN') typeBadge = '🛡️ Admin duyệt & cấp trực tiếp';
            if (item.reward_type === 'PERK_PASS') typeBadge = '👑 Kích hoạt đặc quyền VIP';

            shopEmbed.addFields({
                name: `${index + 1}. ${item.item_name} — \`${item.price.toLocaleString()} Coin\``,
                value: `• **Phân loại:** ${typeBadge}\n• **Mô tả:** ${item.description || 'Không có mô tả chi tiết.'}`,
                inline: false
            });

            selectOptions.push({
                label: item.item_name.substring(0, 50),
                description: `Giá: ${item.price.toLocaleString()} Coin | ${item.reward_type}`,
                value: item.item_id
            });
        });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_shop_checkout')
                .setPlaceholder('👉 Chọn sản phẩm bạn muốn thanh toán...')
                .addOptions(selectOptions)
        );

        const replyMsg = await interaction.reply({ embeds: [shopEmbed], components: [row], ephemeral: true });
        const collector = replyMsg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) return;

            const selectedItemId = i.values[0];

            // 1. Lấy thông tin sản phẩm
            const itemRes = await db.execute({
                sql: "SELECT * FROM shop_items WHERE item_id = ? AND is_active = 1",
                args: [selectedItemId]
            });
            const item = itemRes.rows[0];

            if (!item) {
                return i.reply({ content: '❌ Mặt hàng này hiện không còn khả dụng!', ephemeral: true });
            }

            // 2. Kiểm tra số dư Coin mới nhất
            const freshUserRes = await db.execute({
                sql: "SELECT coin_balance FROM global_users WHERE discord_id = ?",
                args: [userId]
            });
            const currentCoins = freshUserRes.rows[0]?.coin_balance || 0;

            if (currentCoins < item.price) {
                return i.reply({
                    content: `❌ **Số dư không đủ!**\nBạn hiện có: \`${currentCoins.toLocaleString()} Coin\`\nCần thêm: \`${(item.price - currentCoins).toLocaleString()} Coin\` để mua mặt hàng này.`,
                    ephemeral: true
                });
            }

            // 3. Trừ Coin & Tạo mã hóa đơn
            const invoiceId = 'INV-' + Date.now().toString().slice(-6) + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
            const newBalance = currentCoins - item.price;

            let deliveryText = '';
            let deliveryTypeNote = '';

            if (item.reward_type === 'DM_ACCOUNT') {
                deliveryText = item.reward_data;
                deliveryTypeNote = 'Bàn giao tự động qua Bot DM & lưu trong kho đồ';
            } else if (item.reward_type === 'MANUAL_ADMIN') {
                deliveryText = 'PENDING_ADMIN_HANDOVER (Vui lòng chờ Admin liên hệ trao quà)';
                deliveryTypeNote = 'Admin sẽ liên hệ trao phần thưởng trực tiếp';
            } else if (item.reward_type === 'PERK_PASS') {
                const days = parseInt(item.reward_data) || 7;
                const expiresAt = Math.floor(Date.now() / 1000) + (days * 86400);

                await db.execute({
                    sql: "INSERT INTO user_perks (discord_id, perk_type, perk_value, expires_at) VALUES (?, ?, 'ACTIVE', ?)",
                    args: [userId, item.item_id, expiresAt]
                });

                deliveryText = `Đặc quyền kích hoạt thành công: ${days} Ngày hiệu lực`;
                deliveryTypeNote = `Đặc quyền VIP đã được kích hoạt trực tiếp vào tài khoản (${days} Ngày)`;
            }

            // Lưu vào kho đồ / lịch sử mua hàng
            await db.batch([
                {
                    sql: "UPDATE global_users SET coin_balance = coin_balance - ? WHERE discord_id = ?",
                    args: [item.price, userId]
                },
                {
                    sql: `INSERT INTO user_inventory (invoice_id, discord_id, item_id, item_name, item_data, reward_type, price) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    args: [invoiceId, userId, item.item_id, item.item_name, deliveryText, item.reward_type, item.price]
                }
            ], 'write');

            // 4. Tạo hóa đơn DM chuyên nghiệp
            const receiptEmbed = new EmbedBuilder()
                .setTitle('🧾 HÓA ĐƠN THANH TOÁN ĐƠN HÀNG')
                .setColor('#10B981')
                .setDescription(`Cảm ơn bạn đã mua sắm tại cửa hàng! Giao dịch của bạn đã hoàn tất thành công.`)
                .addFields(
                    { name: '🔖 Mã Hóa Đơn', value: `\`${invoiceId}\``, inline: true },
                    { name: '👤 Khách Hàng', value: `<@${userId}>`, inline: true },
                    { name: '📦 Sản Phẩm Đã Mua', value: `**${item.item_name}**`, inline: false },
                    { name: '💰 Tổng Tiền Thanh Toán', value: `\`-${item.price.toLocaleString()} Coin\``, inline: true },
                    { name: '💳 Số Dư Còn Lại', value: `**${newBalance.toLocaleString()} Coin**`, inline: true },
                    { name: '🚚 Hình Thức Nhận', value: deliveryTypeNote, inline: false },
                    { name: '🎁 Chi Tiết Bàn Giao / Nội Dung', value: `\`\`\`text\n${deliveryText}\n\`\`\``, inline: false }
                )
                .setFooter({ text: 'Bạn có thể xem lại toàn bộ hóa đơn đã mua bằng lệnh /inventory' })
                .setTimestamp();

            // 5. Gửi DM và thông báo tại kênh
            let dmStatus = '✅ Đã gửi hóa đơn chi tiết vào **Tin Nhắn Riêng (DM)** của bạn!';
            try {
                await interaction.user.send({ embeds: [receiptEmbed] });
            } catch (err) {
                dmStatus = '⚠️ Mua thành công! Tuy nhiên tin nhắn riêng của bạn đang chặn người lạ. Bạn có thể dùng lệnh `/inventory` để xem hóa đơn và nhận hàng bất kỳ lúc nào.';
            }

            return i.reply({
                content: `🎉 **Thanh toán thành công hóa đơn \`${invoiceId}\`!**\n${dmStatus}`,
                ephemeral: true
            });
        });
    }
};