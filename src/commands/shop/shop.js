const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const crypto = require('crypto');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Cửa hàng quy đổi Coin lấy gói VIP, Role đặc quyền và tài khoản'),

    async execute(interaction) {
        const userId = interaction.user.id;

        const userRes = await db.execute({
            sql: 'SELECT * FROM global_users WHERE discord_id = ?',
            args: [userId]
        });
        const user = userRes.rows[0];

        if (!user) {
            return interaction.reply({ content: '⚠️ Bạn chưa kích hoạt tài khoản! Hãy dùng `/link` trước.', ephemeral: true });
        }

        const itemsRes = await db.execute("SELECT * FROM shop_items WHERE is_active = 1");
        const items = itemsRes.rows;

        if (items.length === 0) {
            return interaction.reply({ content: '🛒 Hiện cửa hàng chưa có mặt hàng nào được mở bán!', ephemeral: true });
        }

        const shopEmbed = new EmbedBuilder()
            .setTitle('💎 TRUNG TÂM MUA SẮM & ĐỔI ROLE VIP')
            .setColor('#7C3AED')
            .setDescription(`✨ Xin chào **${interaction.user.username}**!\n💰 Số dư hiện có: **${user.coin_balance.toLocaleString()} Coin**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n*Chọn sản phẩm từ danh sách bên dưới để tiến hành thanh toán:*`)
            .setFooter({ text: '📦 Hóa đơn & Mã Key sẽ được gửi tự động qua Tin nhắn riêng (DM)' })
            .setTimestamp();

        const selectOptions = [];

        items.forEach((item, index) => {
            let typeBadge = '🔑 Mã Key Kèm Role VIP';
            if (item.reward_type === 'DM_ACCOUNT') typeBadge = '📦 Tài Khoản Tự Động (DM)';
            if (item.reward_type === 'MANUAL_ADMIN') typeBadge = '🛡️ Bàn Giao Thủ Công';
            if (item.reward_type === 'PERK_PASS') typeBadge = '👑 Thẻ Đặc Quyền';

            shopEmbed.addFields({
                name: `\`#${index + 1}\` ${item.item_name} — 💰 ${item.price.toLocaleString()} Coin`,
                value: `> 🏷️ **Phân loại:** ${typeBadge}\n> 📝 **Mô tả:** *${item.description || 'Vật phẩm VIP cao cấp.'}*`,
                inline: false
            });

            selectOptions.push({
                label: item.item_name.substring(0, 50),
                description: `Giá: ${item.price.toLocaleString()} Coin | ${typeBadge}`,
                value: item.item_id,
                emoji: item.reward_type === 'ROLE_VIP' ? '👑' : '🎁'
            });
        });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_shop_checkout')
                .setPlaceholder('👉 Chọn gói vật phẩm muốn đổi...')
                .addOptions(selectOptions)
        );

        const replyMsg = await interaction.reply({ embeds: [shopEmbed], components: [row], ephemeral: true });
        const collector = replyMsg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) return;

            const selectedItemId = i.values[0];
            const itemRes = await db.execute({
                sql: "SELECT * FROM shop_items WHERE item_id = ? AND is_active = 1",
                args: [selectedItemId]
            });
            const item = itemRes.rows[0];

            if (!item) {
                return i.reply({ content: '❌ Mặt hàng này hiện không còn khả dụng!', ephemeral: true });
            }

            const freshUserRes = await db.execute({
                sql: "SELECT coin_balance FROM global_users WHERE discord_id = ?",
                args: [userId]
            });
            const currentCoins = freshUserRes.rows[0]?.coin_balance || 0;

            if (currentCoins < item.price) {
                return i.reply({
                    content: `❌ **Số dư không đủ!**\nBạn có: \`${currentCoins.toLocaleString()} Coin\` | Còn thiếu: \`${(item.price - currentCoins).toLocaleString()} Coin\`.`,
                    ephemeral: true
                });
            }

            const invoiceId = 'INV-' + Date.now().toString().slice(-6) + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
            const newBalance = currentCoins - item.price;
            let deliveryContent = '';
            let guideText = '';

            // 1. Xử lý Mua Gói Cấp ROLE VIP
            if (item.reward_type === 'ROLE_VIP') {
                const generatedKey = 'VIP-' + crypto.randomBytes(4).toString('hex').toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
                const targetRoleId = item.reward_data.trim();

                await db.execute({
                    sql: "INSERT INTO claim_keys (key_code, discord_id, provider, reward_type, reward_role_id, reward_coins) VALUES (?, ?, 'Shop_VIP', 'ROLE_VIP', ?, 0)",
                    args: [generatedKey, userId, targetRoleId]
                });

                deliveryContent = `🔑 MÃ KEY NHẬN ROLE: ${generatedKey}\n🏷️ ROLE ĐƯỢC CẤP: <@&${targetRoleId}>`;
                guideText = `Dùng lệnh \`/redeem ma_key:${generatedKey}\` tại server Discord để kích hoạt Role VIP ngay lập tức!`;
            } 
            // 2. Xử lý Mua Tài Khoản Tự Động (DM_ACCOUNT)
            else if (item.reward_type === 'DM_ACCOUNT') {
                deliveryContent = item.reward_data;
                guideText = 'Thông tin tài khoản đã được bàn giao tự động và lưu an toàn trong kho đồ.';
            } 
            // 3. Bàn giao thủ công (MANUAL_ADMIN)
            else if (item.reward_type === 'MANUAL_ADMIN') {
                deliveryContent = 'PENDING_ADMIN_HANDOVER';
                guideText = 'Admin sẽ liên hệ trao phần thưởng trực tiếp qua Ticket / DM trong vòng 24h.';
            } 
            // 4. Đặc quyền (PERK_PASS)
            else if (item.reward_type === 'PERK_PASS') {
                const days = parseInt(item.reward_data) || 7;
                const expiresAt = Math.floor(Date.now() / 1000) + (days * 86400);

                await db.execute({
                    sql: "INSERT INTO user_perks (discord_id, perk_type, perk_value, expires_at) VALUES (?, ?, 'ACTIVE', ?)",
                    args: [userId, item.item_id, expiresAt]
                });

                deliveryContent = `Đặc quyền: ${item.item_name} (${days} Ngày)`;
                guideText = `Đặc quyền đã được kích hoạt trực tiếp vào tài khoản với thời hạn ${days} ngày.`;
            }

            // Ghi nhận vào Database
            await db.batch([
                {
                    sql: "UPDATE global_users SET coin_balance = coin_balance - ? WHERE discord_id = ?",
                    args: [item.price, userId]
                },
                {
                    sql: `INSERT INTO user_inventory (invoice_id, discord_id, item_id, item_name, item_data, reward_type, price) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    args: [invoiceId, userId, item.item_id, item.item_name, deliveryContent, item.reward_type, item.price]
                }
            ], 'write');

            // Hóa đơn gửi DM
            const invoiceEmbed = new EmbedBuilder()
                .setTitle('🧾 HÓA ĐƠN MUA HÀNG & PHẦN THƯỞNG')
                .setColor('#10B981')
                .setThumbnail(interaction.client.user.displayAvatarURL())
                .addFields(
                    { name: '🔖 Mã Giao Dịch', value: `\`${invoiceId}\``, inline: true },
                    { name: '👤 Người Mua', value: `<@${userId}>`, inline: true },
                    { name: '📦 Sản Phẩm', value: `**${item.item_name}**`, inline: false },
                    { name: '💰 Chi Phí', value: `\`-${item.price.toLocaleString()} Coin\``, inline: true },
                    { name: '💳 Số Dư Còn Lại', value: `**${newBalance.toLocaleString()} Coin**`, inline: true },
                    { name: '🎁 Chi Tiết Bàn Giao', value: `\`\`\`text\n${deliveryContent}\n\`\`\``, inline: false },
                    { name: '💡 Hướng Dẫn Kích Hoạt', value: guideText, inline: false }
                )
                .setFooter({ text: 'Xem lại hóa đơn bất cứ lúc nào bằng lệnh /inventory' })
                .setTimestamp();

            let dmSent = true;
            try {
                await interaction.user.send({ embeds: [invoiceEmbed] });
            } catch {
                dmSent = false;
            }

            return i.reply({
                content: `🎉 **Thanh toán thành công!**\n${dmSent ? '📬 Hóa đơn kèm mã kích hoạt đã được gửi vào **Tin Nhắn Riêng (DM)**.' : '⚠️ Bot không gửi được DM do cài đặt riêng tư của bạn. Hãy dùng lệnh `/inventory` để lấy mã Key!'}\n> Mã hóa đơn: \`${invoiceId}\``,
                ephemeral: true
            });
        });
    }
};