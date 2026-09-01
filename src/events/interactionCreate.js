const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits 
} = require('discord.js');
const crypto = require('crypto');
const db = require('../database');

function extractUserId(input) {
    if (!input) return null;
    const clean = input.replace(/[<@!>]/g, '').trim();
    return /^\d{17,20}$/.test(clean) ? clean : null;
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {

        // 1. Xử lý Slash Commands
        if (interaction.isChatInputCommand()) {
            console.log(`📩 Nhận lệnh: /${interaction.commandName} từ [${interaction.user.tag}]`);
            const command = client.commands.get(interaction.commandName);
            
            if (!command) {
                console.error(`❌ Không tìm thấy lệnh /${interaction.commandName} trong bộ nhớ!`);
                return interaction.reply({ content: '❌ Lệnh này hiện chưa được nạp vào bot!', ephemeral: true });
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`❌ Lỗi thực thi /${interaction.commandName}:`, error);
                try {
                    const replyData = { content: '❌ Đã xảy ra lỗi khi thực thi lệnh này!', ephemeral: true };
                    if (interaction.deferred || interaction.replied) {
                        await interaction.editReply(replyData);
                    } else if (interaction.isRepliable()) {
                        await interaction.reply(replyData);
                    }
                } catch (e) {}
            }
            return;
        }

        // 2. Select Menu mua hàng Shop
        if (interaction.isStringSelectMenu() && interaction.customId === 'select_shop_checkout') {
            await interaction.deferReply({ ephemeral: true });
            const userId = interaction.user.id;
            const selectedItemId = interaction.values[0];

            const itemRes = await db.execute({
                sql: "SELECT * FROM shop_items WHERE item_id = ? AND is_active = 1",
                args: [selectedItemId]
            });
            const item = itemRes.rows[0];

            if (!item) {
                return interaction.editReply({ content: '❌ Mặt hàng này hiện không còn khả dụng!' });
            }

            const freshUserRes = await db.execute({
                sql: "SELECT coin_balance FROM global_users WHERE discord_id = ?",
                args: [userId]
            });
            const currentCoins = freshUserRes.rows[0]?.coin_balance || 0;

            if (currentCoins < item.price) {
                return interaction.editReply({
                    content: `❌ **Số dư không đủ!**\nBạn có: \`${currentCoins.toLocaleString()} Coin\` | Còn thiếu: \`${(item.price - currentCoins).toLocaleString()} Coin\`.`
                });
            }

            const invoiceId = 'INV-' + Date.now().toString().slice(-6) + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
            const newBalance = currentCoins - item.price;
            let deliveryContent = '';
            let guideText = '';

            if (['ROLE_VIP', 'ROLE_EXCLUSIVE', 'ROLE'].includes(item.reward_type)) {
                const generatedKey = 'VIP-' + crypto.randomBytes(3).toString('hex').toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
                const targetRoleId = item.reward_data.trim();

                await db.execute({
                    sql: "INSERT INTO claim_keys (key_code, discord_id, provider, reward_type, reward_role_id, reward_coins, is_used) VALUES (?, ?, 'Shop_VIP', 'ROLE_VIP', ?, 0, 0)",
                    args: [generatedKey, userId, targetRoleId]
                });

                deliveryContent = `🔑 MÃ REDEEM ROLE: ${generatedKey}\n🏷️ ROLE QUY ĐỔI: <@&${targetRoleId}>`;
                guideText = `Dùng lệnh \`/redeem ma_key:${generatedKey}\` trên server để nhận Role ngay!`;
            } else {
                deliveryContent = item.reward_data;
                guideText = 'Thông tin vật phẩm đã được lưu an toàn vào kho đồ.';
            }

            await db.batch([
                { sql: "UPDATE global_users SET coin_balance = coin_balance - ? WHERE discord_id = ?", args: [item.price, userId] },
                { sql: `INSERT INTO user_inventory (invoice_id, discord_id, item_id, item_name, item_data, reward_type, price) VALUES (?, ?, ?, ?, ?, ?, ?)`, args: [invoiceId, userId, item.item_id, item.item_name, deliveryContent, item.reward_type, item.price] }
            ], 'write');

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
                    { name: '💡 Hướng Dẫn', value: guideText, inline: false }
                )
                .setFooter({ text: 'Có thể xem lại hóa đơn bất cứ lúc nào qua lệnh /inventory' })
                .setTimestamp();

            try {
                await interaction.user.send({ embeds: [invoiceEmbed] });
            } catch (e) {}

            return interaction.editReply({
                content: `🎉 **Đổi quà thành công!**\n> Mã hóa đơn: \`${invoiceId}\`\n📬 Hóa đơn kèm mã Key đã được gửi qua DM (hoặc kiểm tra lại trong \`/inventory\`).`
            });
        }

        // 3. Nút bấm tương tác
        if (interaction.isButton()) {
            const customId = interaction.customId;

            if (customId === 'btn_open_redeem_modal') {
                const modal = new ModalBuilder().setCustomId('modal_user_quick_redeem').setTitle('🎁 Nhập Mã Key Nhận Quà');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('inp_redeem_key').setLabel('Nhập mã Key:').setStyle(TextInputStyle.Short).setPlaceholder('KEY-XXXX hoặc VIP-XXXX').setRequired(true)
                ));
                return interaction.showModal(modal);
            }

            if (customId.startsWith('btn_adm_')) {
                const allowedAdmins = process.env.ADMIN_ID ? process.env.ADMIN_ID.split(',').map(id => id.trim()) : [];
                const isOwner = allowedAdmins.includes(interaction.user.id);
                const hasAdminPerm = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

                if (!isOwner && !hasAdminPerm) {
                    return interaction.reply({ content: '🚫 Bạn không có quyền Administrator!', ephemeral: true });
                }
            }

            if (customId === 'btn_adm_coins') {
                const modal = new ModalBuilder().setCustomId('modal_adm_coins').setTitle('💰 Điều Chỉnh Số Dư Coin');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_target').setLabel('Discord ID hoặc @Tag:').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_action').setLabel('Hành động (ADD hoặc SET):').setStyle(TextInputStyle.Short).setValue('ADD').setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_amount').setLabel('Số Coin (nhập -50 để trừ):').setStyle(TextInputStyle.Short).setRequired(true))
                );
                return interaction.showModal(modal);
            }

            if (customId === 'btn_adm_member') {
                const modal = new ModalBuilder().setCustomId('modal_adm_member').setTitle('👤 Quản Lý Thành Viên');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_target').setLabel('Discord ID hoặc @Tag:').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_reset_task').setLabel('Reset nhiệm vụ hôm nay? (YES/NO):').setStyle(TextInputStyle.Short).setValue('NO').setRequired(true))
                );
                return interaction.showModal(modal);
            }

            if (customId === 'btn_adm_add_shop') {
                const modal = new ModalBuilder().setCustomId('modal_adm_add_shop').setTitle('➕ Thêm Vật Phẩm Shop');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_item_id').setLabel('Mã ID (viết liền không dấu):').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_item_name').setLabel('Tên hiển thị:').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_price').setLabel('Giá bán (Coin):').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_type').setLabel('Loại (ROLE_VIP / DM_ACCOUNT):').setStyle(TextInputStyle.Short).setValue('ROLE_VIP').setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_data').setLabel('Role ID hoặc Dữ liệu:').setStyle(TextInputStyle.Paragraph).setRequired(true))
                );
                return interaction.showModal(modal);
            }

            if (customId === 'btn_adm_create_key') {
                const modal = new ModalBuilder().setCustomId('modal_adm_create_key').setTitle('🔑 Tạo Mã Redeem Đổi Thưởng');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_key_type').setLabel('Loại thưởng (ROLE hoặc COIN):').setStyle(TextInputStyle.Short).setValue('ROLE').setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_key_value').setLabel('Role ID hoặc Số Coin:').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_lock_user').setLabel('Discord ID nhận (hoặc GLOBAL):').setStyle(TextInputStyle.Short).setValue('GLOBAL').setRequired(true))
                );
                return interaction.showModal(modal);
            }

            if (customId === 'btn_adm_settings') {
                const modal = new ModalBuilder().setCustomId('modal_adm_settings').setTitle('⚙️ Cài Đặt Hệ Thống');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_reward').setLabel('Coin thưởng khi vượt link:').setStyle(TextInputStyle.Short).setValue('50').setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_limit').setLabel('Giới hạn link vượt/ngày:').setStyle(TextInputStyle.Short).setValue('3').setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_fee').setLabel('Phí sàn chuyển tiền (%):').setStyle(TextInputStyle.Short).setValue('5').setRequired(true))
                );
                return interaction.showModal(modal);
            }

            if (customId === 'btn_adm_refresh') {
                const adminCmd = client.commands.get('admin');
                if (adminCmd) return adminCmd.execute(interaction);
            }
        }

        // 4. Xử lý Form Modal Submit
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_adm_coins') {
                const targetId = extractUserId(interaction.fields.getTextInputValue('inp_target'));
                const action = interaction.fields.getTextInputValue('inp_action').trim().toUpperCase();
                const amount = parseInt(interaction.fields.getTextInputValue('inp_amount').trim());

                if (!targetId) return interaction.reply({ content: '❌ Discord ID không hợp lệ!', ephemeral: true });
                if (isNaN(amount)) return interaction.reply({ content: '⚠️ Số lượng Coin phải là số nguyên!', ephemeral: true });

                await interaction.deferReply({ ephemeral: true });

                if (action === 'SET') {
                    await db.execute({ sql: "INSERT INTO global_users (discord_id, username, coin_balance) VALUES (?, 'User', ?) ON CONFLICT(discord_id) DO UPDATE SET coin_balance = ?", args: [targetId, amount, amount] });
                    return interaction.editReply({ content: `✅ Đã đặt số dư của <@${targetId}> thành **${amount.toLocaleString()} Coin**.` });
                } else {
                    await db.execute({ sql: "INSERT INTO global_users (discord_id, username, coin_balance) VALUES (?, 'User', ?) ON CONFLICT(discord_id) DO UPDATE SET coin_balance = MAX(0, coin_balance + ?)", args: [targetId, Math.max(0, amount), amount] });
                    return interaction.editReply({ content: `✅ Đã ${amount >= 0 ? 'cộng' : 'trừ'} **${Math.abs(amount).toLocaleString()} Coin** cho <@${targetId}>.` });
                }
            }

            if (interaction.customId === 'modal_adm_member') {
                const targetId = extractUserId(interaction.fields.getTextInputValue('inp_target'));
                const resetTask = interaction.fields.getTextInputValue('inp_reset_task').trim().toUpperCase();

                if (!targetId) return interaction.reply({ content: '❌ Discord ID không hợp lệ!', ephemeral: true });
                await interaction.deferReply({ ephemeral: true });

                if (resetTask === 'YES') {
                    const today = new Date().toISOString().split('T')[0];
                    await db.execute({ sql: "UPDATE global_users SET daily_task_count = 0, completed_providers = '', last_task_date = ? WHERE discord_id = ?", args: [today, targetId] });
                }

                const userRes = await db.execute({ sql: "SELECT * FROM global_users WHERE discord_id = ?", args: [targetId] });
                const u = userRes.rows[0];

                if (!u) return interaction.editReply({ content: `❌ Không tìm thấy dữ liệu người dùng <@${targetId}>!` });

                const invRes = await db.execute({ sql: "SELECT COUNT(*) as count FROM user_inventory WHERE discord_id = ?", args: [targetId] });

                const embed = new EmbedBuilder()
                    .setTitle(`🔍 THÔNG TIN THÀNH VIÊN: ${u.username}`)
                    .setColor('#8B5CF6')
                    .addFields(
                        { name: '🆔 Discord ID', value: `\`${u.discord_id}\``, inline: true },
                        { name: '💰 Số Dư Coin', value: `**${u.coin_balance.toLocaleString()}** Coin`, inline: true },
                        { name: '🎯 Nhiệm Vụ Hôm Nay', value: `\`${u.daily_task_count || 0}/3\` lượt`, inline: true },
                        { name: '🔗 Tổng Link Đã Vượt', value: `\`${u.total_links_completed || 0}\` link`, inline: true },
                        { name: '🎒 Vật Phẩm Sở Hữu', value: `\`${invRes.rows[0]?.count || 0}\` món`, inline: true }
                    );

                return interaction.editReply({ content: resetTask === 'YES' ? '🔄 Đã reset số lượt nhiệm vụ hôm nay về 0!' : null, embeds: [embed] });
            }

            if (interaction.customId === 'modal_adm_add_shop') {
                const itemId = interaction.fields.getTextInputValue('inp_item_id').trim();
                const itemName = interaction.fields.getTextInputValue('inp_item_name').trim();
                const price = parseInt(interaction.fields.getTextInputValue('inp_price').trim());
                const itemType = interaction.fields.getTextInputValue('inp_type').trim().toUpperCase();
                const itemData = interaction.fields.getTextInputValue('inp_data').trim();

                if (isNaN(price) || price < 0) return interaction.reply({ content: '⚠️ Giá phải là số hợp lệ!', ephemeral: true });

                await interaction.deferReply({ ephemeral: true });
                await db.execute({
                    sql: `INSERT INTO shop_items (item_id, item_name, price, reward_type, reward_data, description, is_active)
                          VALUES (?, ?, ?, ?, ?, 'Vật phẩm Shop', 1)
                          ON CONFLICT(item_id) DO UPDATE SET item_name=excluded.item_name, price=excluded.price, reward_type=excluded.reward_type, reward_data=excluded.reward_data, is_active=1`,
                    args: [itemId, itemName, price, itemType, itemData]
                });
                return interaction.editReply({ content: `✅ Đã lưu mặt hàng **${itemName}** (\`${itemId}\`) vào Shop với giá **${price.toLocaleString()} Coin**!` });
            }

            if (interaction.customId === 'modal_adm_create_key') {
                const keyType = interaction.fields.getTextInputValue('inp_key_type').trim().toUpperCase();
                const rawVal = interaction.fields.getTextInputValue('inp_key_value').trim();
                let lockTarget = interaction.fields.getTextInputValue('inp_lock_user').trim();
                lockTarget = (!lockTarget || lockTarget.toUpperCase() === 'GLOBAL') ? 'GLOBAL' : (extractUserId(lockTarget) || 'GLOBAL');

                await interaction.deferReply({ ephemeral: true });

                const isRole = keyType.includes('ROLE');
                const keyCode = (isRole ? 'ROLE-' : 'GIFT-') + crypto.randomBytes(3).toString('hex').toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();

                if (isRole) {
                    await db.execute({
                        sql: "INSERT INTO claim_keys (key_code, discord_id, provider, reward_type, reward_role_id, reward_coins, is_used) VALUES (?, ?, 'Admin_Gift', 'ROLE_VIP', ?, 0, 0)",
                        args: [keyCode, lockTarget, rawVal]
                    });
                    return interaction.editReply({ content: `✅ **Tạo Redeem Code Role thành công!**\n• Mã Key: \`${keyCode}\`\n• Cấp Role: <@&${rawVal}>\n• Người nhận: ${lockTarget === 'GLOBAL' ? '`Tất cả mọi người`' : `<@${lockTarget}>`}` });
                } else {
                    const coins = parseInt(rawVal) || 50;
                    await db.execute({
                        sql: "INSERT INTO claim_keys (key_code, discord_id, provider, reward_type, reward_coins, is_used) VALUES (?, ?, 'Admin_Gift', 'COIN', ?, 0)",
                        args: [keyCode, lockTarget, coins]
                    });
                    return interaction.editReply({ content: `✅ **Tạo Redeem Code Coin thành công!**\n• Mã Key: \`${keyCode}\`\n• Thưởng: **+${coins.toLocaleString()} Coin**\n• Người nhận: ${lockTarget === 'GLOBAL' ? '`Tất cả mọi người`' : `<@${lockTarget}>`}` });
                }
            }

            if (interaction.customId === 'modal_adm_settings') {
                const reward = parseInt(interaction.fields.getTextInputValue('inp_reward').trim());
                const limit = parseInt(interaction.fields.getTextInputValue('inp_limit').trim());
                const fee = parseInt(interaction.fields.getTextInputValue('inp_fee').trim());

                if (isNaN(reward) || isNaN(limit) || isNaN(fee)) return interaction.reply({ content: '⚠️ Cấu hình phải là số!', ephemeral: true });

                await interaction.deferReply({ ephemeral: true });
                await db.batch([
                    { sql: "INSERT INTO system_settings (setting_key, setting_value) VALUES ('task_reward_coins', ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value", args: [reward.toString()] },
                    { sql: "INSERT INTO system_settings (setting_key, setting_value) VALUES ('daily_task_limit', ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value", args: [limit.toString()] },
                    { sql: "INSERT INTO system_settings (setting_key, setting_value) VALUES ('trade_fee_percent', ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value", args: [fee.toString()] }
                ], 'write');
                return interaction.editReply({ content: `✅ Đã lưu cài đặt:\n• Thưởng: **+${reward} Coin**\n• Giới hạn: **${limit} link/ngày**\n• Phí chuyển: **${fee}%**` });
            }

            if (interaction.customId === 'modal_user_quick_redeem') {
                const keyCode = interaction.fields.getTextInputValue('inp_redeem_key').trim().toUpperCase();
                const redeemCmd = client.commands.get('redeem');
                if (redeemCmd) {
                    interaction.options = { getString: () => keyCode };
                    return redeemCmd.execute(interaction);
                }
            }
        }
    }
};