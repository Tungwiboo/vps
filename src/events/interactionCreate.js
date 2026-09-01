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

        // ==========================================
        // 1. XỬ LÝ NÚT BẤM (MỞ MODAL DƯỚI 0.1 GIÂY)
        // ==========================================
        if (interaction.isButton()) {
            if (interaction.customId === 'btn_open_redeem_modal') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_user_quick_redeem')
                    .setTitle('🎁 NHẬP MÃ KEY NHẬN THƯỞNG');

                const keyInput = new TextInputBuilder()
                    .setCustomId('inp_redeem_key')
                    .setLabel('Nhập mã Key nhận được từ Web:')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ví dụ: KEY-LINK4M-XXXX')
                    .setRequired(true)
                    .setMaxLength(100);

                const row = new ActionRowBuilder().addComponents(keyInput);
                modal.addComponents(row);

                return await interaction.showModal(modal).catch(err => {
                    console.error('❌ Lỗi showModal:', err);
                });
            }

            // Nút Admin Hub
            if (interaction.customId.startsWith('btn_adm_')) {
                const allowedAdmins = process.env.ADMIN_ID ? process.env.ADMIN_ID.split(',').map(id => id.trim()) : [];
                const isOwner = allowedAdmins.includes(interaction.user.id);
                const hasAdminPerm = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

                if (!isOwner && !hasAdminPerm) {
                    return interaction.reply({ content: '🚫 Bạn không có quyền Administrator!', ephemeral: true });
                }

                if (interaction.customId === 'btn_adm_coins') {
                    const modal = new ModalBuilder().setCustomId('modal_adm_coins').setTitle('💰 Điều Chỉnh Số Dư Coin');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_target').setLabel('Discord ID hoặc @Tag:').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_action').setLabel('Hành động (ADD hoặc SET):').setStyle(TextInputStyle.Short).setValue('ADD').setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_amount').setLabel('Số Coin (nhập -50 để trừ):').setStyle(TextInputStyle.Short).setRequired(true))
                    );
                    return await interaction.showModal(modal);
                }

                if (interaction.customId === 'btn_adm_member') {
                    const modal = new ModalBuilder().setCustomId('modal_adm_member').setTitle('👤 Quản Lý Thành Viên');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_target').setLabel('Discord ID hoặc @Tag:').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_reset_task').setLabel('Reset nhiệm vụ? (YES/NO):').setStyle(TextInputStyle.Short).setValue('NO').setRequired(true))
                    );
                    return await interaction.showModal(modal);
                }

                if (interaction.customId === 'btn_adm_add_shop') {
                    const modal = new ModalBuilder().setCustomId('modal_adm_add_shop').setTitle('➕ Thêm Mặt Hàng Shop');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_item_id').setLabel('Mã ID (viết liền không dấu):').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_item_name').setLabel('Tên hiển thị:').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_price').setLabel('Giá bán (Coin):').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_type').setLabel('Loại (ROLE_VIP / DM_ACCOUNT):').setStyle(TextInputStyle.Short).setValue('ROLE_VIP').setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_data').setLabel('Role ID hoặc Dữ liệu:').setStyle(TextInputStyle.Paragraph).setRequired(true))
                    );
                    return await interaction.showModal(modal);
                }

                if (interaction.customId === 'btn_adm_create_key') {
                    const modal = new ModalBuilder().setCustomId('modal_adm_create_key').setTitle('🔑 Tạo Mã Redeem Đổi Thưởng');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_key_type').setLabel('Loại thưởng (ROLE hoặc COIN):').setStyle(TextInputStyle.Short).setValue('ROLE').setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_key_value').setLabel('Role ID hoặc Số Coin:').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_lock_user').setLabel('Discord ID (hoặc GLOBAL):').setStyle(TextInputStyle.Short).setValue('GLOBAL').setRequired(true))
                    );
                    return await interaction.showModal(modal);
                }

                if (interaction.customId === 'btn_adm_settings') {
                    const modal = new ModalBuilder().setCustomId('modal_adm_settings').setTitle('⚙️ Cài Đặt Hệ Thống');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_reward').setLabel('Coin thưởng khi vượt link:').setStyle(TextInputStyle.Short).setValue('50').setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_limit').setLabel('Giới hạn link vượt/ngày:').setStyle(TextInputStyle.Short).setValue('3').setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_fee').setLabel('Phí chuyển coin (%):').setStyle(TextInputStyle.Short).setValue('5').setRequired(true))
                    );
                    return await interaction.showModal(modal);
                }

                if (interaction.customId === 'btn_adm_refresh') {
                    const adminCmd = client.commands.get('admin');
                    if (adminCmd) return adminCmd.execute(interaction);
                }
            }
            return;
        }

        // ==========================================
        // 2. XỬ LÝ GỬI FORM MODAL SUBMIT (NHẬN KEY)
        // ==========================================
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_user_quick_redeem') {
                await interaction.deferReply({ ephemeral: true });
                const userId = interaction.user.id;
                const cleanKey = interaction.fields.getTextInputValue('inp_redeem_key').trim().toUpperCase();

                try {
                    const userRes = await db.execute({
                        sql: 'SELECT * FROM global_users WHERE discord_id = ?',
                        args: [userId]
                    });
                    let user = userRes.rows[0];

                    if (!user) {
                        await db.execute({
                            sql: "INSERT INTO global_users (discord_id, username, coin_balance) VALUES (?, ?, 0)",
                            args: [userId, interaction.user.username]
                        });
                        user = { discord_id: userId, coin_balance: 0 };
                    }

                    const keyRes = await db.execute({
                        sql: 'SELECT * FROM claim_keys WHERE key_code = ?',
                        args: [cleanKey]
                    });
                    const keyData = keyRes.rows[0];

                    if (!keyData) {
                        return interaction.editReply({ content: `❌ Mã Key \`${cleanKey}\` không tồn tại hoặc đã nhập sai!` });
                    }

                    if (keyData.is_used === 1) {
                        return interaction.editReply({ content: `⚠️ Mã Key \`${cleanKey}\` **đã được sử dụng trước đó**!` });
                    }

                    if (keyData.discord_id !== 'GLOBAL' && keyData.discord_id !== userId) {
                        return interaction.editReply({ content: '🛑 **Từ chối:** Mã Key này thuộc quyền sở hữu của người khác!' });
                    }

                    if (['ROLE_VIP', 'ROLE_EXCLUSIVE', 'ROLE'].includes(keyData.reward_type) || keyData.reward_role_id) {
                        if (!interaction.guild) {
                            return interaction.editReply({ content: '⚠️ Bạn phải nhập Key trong Server Discord để Bot cấp Role!' });
                        }

                        const roleId = keyData.reward_role_id;
                        const targetRole = interaction.guild.roles.cache.get(roleId);

                        if (!targetRole) {
                            return interaction.editReply({ content: `⚠️ Không tìm thấy Role có ID \`${roleId}\` trên server!` });
                        }

                        try {
                            const member = await interaction.guild.members.fetch(userId);
                            await member.roles.add(targetRole);
                        } catch (err) {
                            return interaction.editReply({ content: `⚠️ Bot thiếu quyền cấp Role **${targetRole.name}**!` });
                        }

                        await db.execute({
                            sql: 'UPDATE claim_keys SET is_used = 1 WHERE key_code = ?',
                            args: [cleanKey]
                        });

                        const embedRole = new EmbedBuilder()
                            .setTitle('👑 KÍCH HOẠT ROLE THÀNH CÔNG!')
                            .setColor('#F59E0B')
                            .setDescription(`Chúc mừng bạn đã nhận Role đặc quyền!\n\n🏷️ **Role:** <@&${roleId}>\n🔑 **Mã Key:** \`${cleanKey}\``)
                            .setTimestamp();

                        return interaction.editReply({ embeds: [embedRole] });
                    }

                    const rewardCoins = parseInt(keyData.reward_coins) || 50;
                    await db.batch([
                        {
                            sql: 'UPDATE claim_keys SET is_used = 1 WHERE key_code = ?',
                            args: [cleanKey]
                        },
                        {
                            sql: 'UPDATE global_users SET coin_balance = coin_balance + ?, daily_task_count = daily_task_count + 1, total_links_completed = total_links_completed + 1 WHERE discord_id = ?',
                            args: [rewardCoins, userId]
                        }
                    ], 'write');

                    const newBalance = (user.coin_balance || 0) + rewardCoins;

                    const embedCoin = new EmbedBuilder()
                        .setTitle('🎉 QUY ĐỔI COIN THÀNH CÔNG!')
                        .setColor('#10B981')
                        .setDescription(`Nhận thành công **+${rewardCoins.toLocaleString()} Coin** vào tài khoản ví!`)
                        .addFields(
                            { name: '🔑 Mã Key Đã Dùng', value: `\`${cleanKey}\``, inline: true },
                            { name: '💰 Số Dư Mới', value: `**${newBalance.toLocaleString()}** Coin`, inline: true }
                        )
                        .setTimestamp();

                    return interaction.editReply({ embeds: [embedCoin] });

                } catch (err) {
                    console.error('❌ Lỗi xử lý Key:', err);
                    return interaction.editReply({ content: '⚠️ Đã xảy ra lỗi trong quá trình kích hoạt Key!' });
                }
            }

            if (interaction.customId === 'modal_adm_coins') {
                const targetId = extractUserId(interaction.fields.getTextInputValue('inp_target'));
                const action = interaction.fields.getTextInputValue('inp_action').trim().toUpperCase();
                const amount = parseInt(interaction.fields.getTextInputValue('inp_amount').trim());

                if (!targetId || isNaN(amount)) return interaction.reply({ content: '❌ Thông tin không hợp lệ!', ephemeral: true });

                await interaction.deferReply({ ephemeral: true });
                if (action === 'SET') {
                    await db.execute({ sql: "INSERT INTO global_users (discord_id, username, coin_balance) VALUES (?, 'User', ?) ON CONFLICT(discord_id) DO UPDATE SET coin_balance = ?", args: [targetId, amount, amount] });
                } else {
                    await db.execute({ sql: "INSERT INTO global_users (discord_id, username, coin_balance) VALUES (?, 'User', ?) ON CONFLICT(discord_id) DO UPDATE SET coin_balance = MAX(0, coin_balance + ?)", args: [targetId, Math.max(0, amount), amount] });
                }
                return interaction.editReply({ content: `✅ Đã cập nhật số dư cho <@${targetId}>!` });
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
                return interaction.editReply({ content: `✅ Đã cập nhật thành viên <@${targetId}>!` });
            }

            if (interaction.customId === 'modal_adm_add_shop') {
                const itemId = interaction.fields.getTextInputValue('inp_item_id').trim();
                const itemName = interaction.fields.getTextInputValue('inp_item_name').trim();
                const price = parseInt(interaction.fields.getTextInputValue('inp_price').trim());
                const itemType = interaction.fields.getTextInputValue('inp_type').trim().toUpperCase();
                const itemData = interaction.fields.getTextInputValue('inp_data').trim();

                if (isNaN(price)) return interaction.reply({ content: '⚠️ Giá phải là số hợp lệ!', ephemeral: true });

                await interaction.deferReply({ ephemeral: true });
                await db.execute({
                    sql: `INSERT INTO shop_items (item_id, item_name, price, reward_type, reward_data, description, is_active)
                          VALUES (?, ?, ?, ?, ?, 'Vật phẩm Shop', 1)
                          ON CONFLICT(item_id) DO UPDATE SET item_name=excluded.item_name, price=excluded.price, reward_type=excluded.reward_type, reward_data=excluded.reward_data, is_active=1`,
                    args: [itemId, itemName, price, itemType, itemData]
                });
                return interaction.editReply({ content: `✅ Đã lưu mặt hàng **${itemName}** vào Shop!` });
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
                } else {
                    const coins = parseInt(rawVal) || 50;
                    await db.execute({
                        sql: "INSERT INTO claim_keys (key_code, discord_id, provider, reward_type, reward_coins, is_used) VALUES (?, ?, 'Admin_Gift', 'COIN', ?, 0)",
                        args: [keyCode, lockTarget, coins]
                    });
                }
                return interaction.editReply({ content: `✅ Đã tạo mã Key: \`${keyCode}\`` });
            }

            if (interaction.customId === 'modal_adm_settings') {
                const reward = parseInt(interaction.fields.getTextInputValue('inp_reward').trim());
                const limit = parseInt(interaction.fields.getTextInputValue('inp_limit').trim());
                const fee = parseInt(interaction.fields.getTextInputValue('inp_fee').trim());

                await interaction.deferReply({ ephemeral: true });
                await db.batch([
                    { sql: "INSERT INTO system_settings (setting_key, setting_value) VALUES ('task_reward_coins', ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value", args: [reward.toString()] },
                    { sql: "INSERT INTO system_settings (setting_key, setting_value) VALUES ('daily_task_limit', ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value", args: [limit.toString()] },
                    { sql: "INSERT INTO system_settings (setting_key, setting_value) VALUES ('trade_fee_percent', ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value", args: [fee.toString()] }
                ], 'write');
                return interaction.editReply({ content: '✅ Đã lưu cấu hình hệ thống thành công!' });
            }
            return;
        }

        // ==========================================
        // 3. XỬ LÝ SLASH COMMANDS (/profile, /nhiemvu,...)
        // ==========================================
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`❌ Lỗi lệnh /${interaction.commandName}:`, error);
                const msg = { content: '⚠️ Lỗi: ' + error.message, ephemeral: true };
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(msg).catch(() => {});
                } else {
                    await interaction.reply(msg).catch(() => {});
                }
            }
            return;
        }

        // ==========================================
        // 4. XỬ LÝ SELECT MENU SHOP
        // ==========================================
        if (interaction.isStringSelectMenu() && interaction.customId === 'select_shop_checkout') {
            await interaction.deferReply({ ephemeral: true });
            const userId = interaction.user.id;
            const selectedItemId = interaction.values[0];

            try {
                const itemRes = await db.execute({
                    sql: "SELECT * FROM shop_items WHERE item_id = ? AND is_active = 1",
                    args: [selectedItemId]
                });
                const item = itemRes.rows[0];

                if (!item) return interaction.editReply({ content: '❌ Mặt hàng này hiện không còn khả dụng!' });

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

                    deliveryContent = `🔑 MÃ REDEEM ROLE: ${generatedKey}\n🏷️ ROLE: <@&${targetRoleId}>`;
                    guideText = `Dùng lệnh \`/redeem ma_key:${generatedKey}\` trên server để nhận Role ngay!`;
                } else {
                    deliveryContent = item.reward_data;
                    guideText = 'Thông tin vật phẩm đã được lưu an toàn vào kho đồ /inventory.';
                }

                await db.batch([
                    { sql: "UPDATE global_users SET coin_balance = coin_balance - ? WHERE discord_id = ?", args: [item.price, userId] },
                    { sql: `INSERT INTO user_inventory (invoice_id, discord_id, item_id, item_name, item_data, reward_type, price) VALUES (?, ?, ?, ?, ?, ?, ?)`, args: [invoiceId, userId, item.item_id, item.item_name, deliveryContent, item.reward_type, item.price] }
                ], 'write');

                const invoiceEmbed = new EmbedBuilder()
                    .setTitle('🧾 HÓA ĐƠN ĐỔI QUÀ THÀNH CÔNG')
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
                    .setFooter({ text: 'Xem lại hóa đơn bất kỳ lúc nào qua lệnh /inventory' })
                    .setTimestamp();

                try {
                    await interaction.user.send({ embeds: [invoiceEmbed] });
                } catch (e) {}

                return interaction.editReply({
                    content: `🎉 **Đổi quà thành công!**\n> Mã hóa đơn: \`${invoiceId}\`\n📬 Chi tiết đã được gửi qua DM (hoặc xem tại \`/inventory\`).`
                });
            } catch (err) {
                console.error('Lỗi Select Menu Shop:', err);
                return interaction.editReply({ content: '⚠️ Lỗi thanh toán: ' + err.message });
            }
        }
    }
};