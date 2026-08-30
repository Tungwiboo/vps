const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const crypto = require('crypto');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Cửa hàng quy đổi Coin lấy mã Redeem Role VIP, Role Độc Quyền'),

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
            .setTitle('💎 TRUNG TÂM QUY ĐỔI MÃ KEY ROLE & VẬT PHẨM')
            .setColor('#7C3AED')
            .setDescription(`✨ Xin chào **${interaction.user.username}**!\n💰 Số dư ví của bạn: **${user.coin_balance.toLocaleString()} Coin**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n*Chọn gói sản phẩm bạn muốn đổi từ danh sách bên dưới:*`)
            .setFooter({ text: 'Mã Redeem sẽ được tạo riêng và khóa độc quyền theo ID của bạn' })
            .setTimestamp();

        const selectOptions = [];

        items.forEach((item, index) => {
            let typeBadge = '🔑 Mã Redeem Cấp Role';
            if (item.reward_type === 'DM_ACCOUNT') typeBadge = '📦 Tài Khoản Tự Động';
            if (item.reward_type === 'PERK_PASS') typeBadge = '👑 Thẻ Đặc Quyền';

            shopEmbed.addFields({
                name: `\`#${index + 1}\` ${item.item_name} — 💰 ${item.price.toLocaleString()} Coin`,
                value: `> 🏷️ **Phân loại:** \`${typeBadge}\`\n> 📝 **Mô tả:** *${item.description || 'Vật phẩm VIP đặc quyền.'}*`,
                inline: false
            });

            selectOptions.push({
                label: item.item_name.substring(0, 50),
                description: `Giá: ${item.price.toLocaleString()} Coin | ${typeBadge}`,
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

            // XỬ LÝ MUA ROLE (TẠO REDEEM CODE CHÍNH CHỦ DÙNG 1 LẦN)
            if (item.reward_type === 'ROLE_VIP' || item.reward_type === 'ROLE_EXCLUSIVE' || item.reward_type === 'ROLE') {
                const generatedKey = 'VIP-' + crypto.randomBytes(3).toString('hex').toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
                const targetRoleId = item.reward_data.trim();

                // Lưu vào claim_keys (khóa theo discord_id của người mua)
                await db.execute({
                    sql: "INSERT INTO claim_keys (key_code, discord_id, provider, reward_type, reward_role_id, reward_coins, is_used) VALUES (?, ?, 'Shop_VIP', 'ROLE_VIP', ?, 0, 0)",
                    args: [generatedKey, userId, targetRoleId]
                });

                deliveryContent = `🔑 MÃ REDEEM ROLE: ${generatedKey}\n🏷️ ROLE QUY ĐỔI: <@&${targetRoleId}>`;
                guideText = `Dùng lệnh \`/redeem ma_key:${generatedKey}\` trên server để nhận Role ngay lập tức! (Chỉ duy nhất bạn mới kích hoạt được mã này).`;
            } else {
                deliveryContent = item.reward_data;
                guideText = 'Thông tin vật phẩm đã được lưu an toàn vào kho đồ.';
            }

            // Trừ tiền & Lưu vào kho đồ
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

            // Gửi hóa đơn vào DM
            const invoiceEmbed = new EmbedBuilder()
                .setTitle('🧾 HÓA ĐƠN ĐỔI MÃ REDEEM THÀNH CÔNG')
                .setColor('#10B981')
                .addFields(
                    { name: '🔖 Mã Hóa Đơn', value: `\`${invoiceId}\``, inline: true },
                    { name: '👤 Người Nhận', value: `<@${userId}>`, inline: true },
                    { name: '📦 Sản Phẩm', value: `**${item.item_name}**`, inline: false },
                    { name: '💰 Đã Trừ', value: `\`-${item.price.toLocaleString()} Coin\``, inline: true },
                    { name: '💳 Số Dư Còn', value: `**${newBalance.toLocaleString()} Coin**`, inline: true },
                    { name: '🎁 Chi Tiết Bàn Giao', value: `\`\`\`text\n${deliveryContent}\n\`\`\``, inline: false },
                    { name: '💡 Hướng Dẫn Kích Hoạt', value: guideText, inline: false }
                )
                .setFooter({ text: 'Có thể xem lại mã bất cứ lúc nào qua lệnh /inventory' })
                .setTimestamp();

            try {
                await interaction.user.send({ embeds: [invoiceEmbed] });
            } catch {}

            return i.reply({
                content: `🎉 **Đổi quà thành công!**\n> Mã hóa đơn: \`${invoiceId}\`\n📬 Hóa đơn kèm **Mã Redeem kích hoạt** đã được gửi qua DM (hoặc kiểm tra lại trong \`/inventory\`).`,
                ephemeral: true
            });
        });
    }
};