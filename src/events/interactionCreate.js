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

        // ========================================================
        // 1. XỬ LÝ LỆNH SLASH COMMANDS
        // ========================================================
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`❌ Lỗi thực thi /${interaction.commandName}:`, error);
                const replyData = { content: '❌ Đã xảy ra lỗi khi thực thi lệnh này!', ephemeral: true };
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(replyData);
                } else {
                    await interaction.reply(replyData);
                }
            }
            return;
        }

        // ========================================================
        // 2. XỬ LÝ CÁC NÚT BẤM (BUTTONS)
        // ========================================================
        if (interaction.isButton()) {
            const customId = interaction.customId;

            // Nút mở Modal nhập Key nhanh từ /nhiemvu
            if (customId === 'btn_open_redeem_modal') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_user_quick_redeem')
                    .setTitle('🎁 Nhập Mã Key Nhận Quà');

                const keyInput = new TextInputBuilder()
                    .setCustomId('inp_redeem_key')
                    .setLabel('Nhập mã Key của bạn:')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ví dụ: KEY-XXXX hoặc VIP-XXXX')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(keyInput));
                return interaction.showModal(modal);
            }

            // Kiểm tra quyền Admin cho các nút quản trị
            if (customId.startsWith('btn_adm_')) {
                const allowedAdmins = process.env.ADMIN_ID ? process.env.ADMIN_ID.split(',').map(id => id.trim()) : [];
                const isOwner = allowedAdmins.includes(interaction.user.id);
                const hasAdminPerm = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

                if (!isOwner && !hasAdminPerm) {
                    return interaction.reply({ content: '🚫 Bạn không có quyền Administrator để thực hiện!', ephemeral: true });
                }
            }

            // Nút 1: Chỉnh Sửa Coin
            if (customId === 'btn_adm_coins') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_adm_coins')
                    .setTitle('💰 Điều Chỉnh Số Dư Coin');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_target')
                            .setLabel('Discord ID hoặc @Tag:')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Ví dụ: 1023456789012345678')
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_action')
                            .setLabel('Hành động (ADD = Thêm | SET = Đặt lại):')
                            .setStyle(TextInputStyle.Short)
                            .setValue('ADD')
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_amount')
                            .setLabel('Số Coin (Nhập số âm -50 để trừ):')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Ví dụ: 500 hoặc -100')
                            .setRequired(true)
                    )
                );
                return interaction.showModal(modal);
            }

            // Nút 2: Quản Lý & Tra Cứu Thành Viên
            if (customId === 'btn_adm_member') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_adm_member')
                    .setTitle('👤 Quản Lý Thành Viên');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_target')
                            .setLabel('Discord ID hoặc @Tag cần tra:')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_reset_task')
                            .setLabel('Reset nhiệm vụ hôm nay? (YES / NO):')
                            .setStyle(TextInputStyle.Short)
                            .setValue('NO')
                            .setRequired(true)
                    )
                );
                return interaction.showModal(modal);
            }

            // Nút 3: Thêm Vật Phẩm Shop
            if (customId === 'btn_adm_add_shop') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_adm_add_shop')
                    .setTitle('➕ Thêm Vật Phẩm Vào Shop');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_item_id')
                            .setLabel('Mã ID (viết liền không dấu):')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('ví dụ: vip_gold, acc_game')
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_item_name')
                            .setLabel('Tên hiển thị:')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('ví dụ: 👑 Role VIP Gold')
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_price')
                            .setLabel('Giá bán (Coin):')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('100')
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_type')
                            .setLabel('Loại: ROLE_VIP / DM_ACCOUNT:')
                            .setStyle(TextInputStyle.Short)
                            .setValue('ROLE_VIP')
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_data')
                            .setLabel('Role ID (nếu ROLE) hoặc Dữ liệu:')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                    )
                );
                return interaction.showModal(modal);
            }

            // Nút 4: Tạo Mã Key Đổi Thưởng
            if (customId === 'btn_adm_create_key') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_adm_create_key')
                    .setTitle('🔑 Tạo Mã Redeem Đổi Thưởng');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_key_type')
                            .setLabel('Loại: ROLE (Role VIP) hoặc COIN:')
                            .setStyle(TextInputStyle.Short)
                            .setValue('ROLE')
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_key_value')
                            .setLabel('Role ID (nếu ROLE) hoặc Số Coin:')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Ví dụ: 123456789012345678 hoặc 500')
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_lock_user')
                            .setLabel('Khóa theo Discord ID (hoặc GLOBAL):')
                            .setStyle(TextInputStyle.Short)
                            .setValue('GLOBAL')
                            .setRequired(true)
                    )
                );
                return interaction.showModal(modal);
            }

            // Nút 5: Cấu Hình Hệ Thống
            if (customId === 'btn_adm_settings') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_adm_settings')
                    .setTitle('⚙️ Cài Đặt Hệ Thống');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_reward')
                            .setLabel('Số Coin thưởng khi vượt 1 link:')
                            .setStyle(TextInputStyle.Short)
                            .setValue('50')
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_limit')
                            .setLabel('Giới hạn số link vượt / ngày:')
                            .setStyle(TextInputStyle.Short)
                            .setValue('3')
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('inp_fee')
                            .setLabel('Phí sàn chuyển tiền /pay (%):')
                            .setStyle(TextInputStyle.Short)
                            .setValue('5')
                            .setRequired(true)
                    )
                );
                return interaction.showModal(modal);
            }

            // Nút 6: Refresh Dashboard
            if (customId === 'btn_adm_refresh') {
                const adminCmd = client.commands.get('admin');
                if (adminCmd) return adminCmd.execute(interaction);
            }
        }

        // ========================================================
        // 3. XỬ LÝ GỬI FORM MODAL (MODAL SUBMIT)
        // ========================================================
        if (interaction.isModalSubmit()) {

            // Form: Chỉnh Sửa Coin
            if (interaction.customId === 'modal_adm_coins') {
                const targetId = extractUserId(interaction.fields.getTextInputValue('inp_target'));
                const action = interaction.fields.getTextInputValue('inp_action').trim().toUpperCase();
                const amount = parseInt(interaction.fields.getTextInputValue('inp_amount').trim());

                if (!targetId) return interaction.reply({ content: '❌ Discord ID người dùng không hợp lệ!', ephemeral: true });
                if (isNaN(amount)) return interaction.reply({ content: '⚠️ Số lượng Coin phải là số nguyên!', ephemeral: true });

                await interaction.deferReply({ ephemeral: true });

                if (action === 'SET') {
                    await db.execute({
                        sql: "INSERT INTO global_users (discord_id, username, coin_balance) VALUES (?, 'User', ?) ON CONFLICT(discord_id) DO UPDATE SET coin_balance = ?",
                        args: [targetId, amount, amount]
                    });
                    return interaction.editReply({ content: `✅ Đã thiết lập số dư của <@${targetId}> thành **${amount.toLocaleString()} Coin**.` });
                } else {
                    await db.execute({
                        sql: "INSERT INTO global_users (discord_id, username, coin_balance) VALUES (?, 'User', ?) ON CONFLICT(discord_id) DO UPDATE SET coin_balance = MAX(0, coin_balance + ?)",
                        args: [targetId, Math.max(0, amount), amount]
                    });
                    return interaction.editReply({ content: `✅ Đã ${amount >= 0 ? 'cộng' : 'trừ'} **${Math.abs(amount).toLocaleString()} Coin** cho <@${targetId}>.` });
                }
            }

            // Form: Tra Cứu & Quản Lý Thành Viên
            if (interaction.customId === 'modal_adm_member') {
                const targetId = extractUserId(interaction.fields.getTextInputValue('inp_target'));
                const resetTask = interaction.fields.getTextInputValue('inp_reset_task').trim().toUpperCase();

                if (!targetId) return interaction.reply({ content: '❌ Discord ID không hợp lệ!', ephemeral: true });
                await interaction.deferReply({ ephemeral: true });

                if (resetTask === 'YES') {
                    const today = new Date().toISOString().split('T')[0];
                    await db.execute({
                        sql: "UPDATE global_users SET daily_task_count = 0, completed_providers = '', last_task_date = ? WHERE discord_id = ?",
                        args: [today, targetId]
                    });
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
                        { name: '🎒 Vật Phẩm Sở Hữu', value: `\`${invRes.rows[0]?.count || 0}\` món`, inline: true },
                        { name: '🌐 Cổng Vượt Hôm Nay', value: `\`${u.completed_providers || 'Chưa vượt cổng nào'}\``, inline: false }
                    );

                return interaction.editReply({
                    content: resetTask === 'YES' ? '🔄 Đã reset số lượt nhiệm vụ hôm nay về 0!' : null,
                    embeds: [embed]
                });
            }

            // Form: Thêm Vật Phẩm Shop
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
                          VALUES (?, ?, ?, ?, ?, 'Vật phẩm mua tại Shop', 1)
                          ON CONFLICT(item_id) DO UPDATE SET
                          item_name=excluded.item_name, price=excluded.price, reward_type=excluded.reward_type, reward_data=excluded.reward_data, is_active=1`,
                    args: [itemId, itemName, price, itemType, itemData]
                });

                return interaction.editReply({ content: `✅ Đã thêm/cập nhật món hàng **${itemName}** (\`${itemId}\`) vào Shop với giá **${price.toLocaleString()} Coin**!` });
            }

            // Form: Tạo Mã Key Đổi Thưởng
            if (interaction.customId === 'modal_adm_create_key') {
                const keyType = interaction.fields.getTextInputValue('inp_key_type').trim().toUpperCase();
                const rawVal = interaction.fields.getTextInputValue('inp_key_value').trim();
                let lockTarget = interaction.fields.getTextInputValue('inp_lock_user').trim();
                
                if (!lockTarget || lockTarget.toUpperCase() === 'GLOBAL') {
                    lockTarget = 'GLOBAL';
                } else {
                    lockTarget = extractUserId(lockTarget) || 'GLOBAL';
                }

                await interaction.deferReply({ ephemeral: true });

                const isRole = keyType.includes('ROLE');
                const prefix = isRole ? 'ROLE-' : 'GIFT-';
                const keyCode = prefix + crypto.randomBytes(3).toString('hex').toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();

                if (isRole) {
                    await db.execute({
                        sql: "INSERT INTO claim_keys (key_code, discord_id, provider, reward_type, reward_role_id, reward_coins, is_used) VALUES (?, ?, 'Admin_Gift', 'ROLE_VIP', ?, 0, 0)",
                        args: [keyCode, lockTarget, rawVal]
                    });

                    return interaction.editReply({
                        content: `✅ **Tạo Redeem Code Role thành công!**\n• Mã Key: \`${keyCode}\`\n• Quyền lợi: Cấp Role <@&${rawVal}> (\`${rawVal}\`)\n• Giới hạn sở hữu: ${lockTarget === 'GLOBAL' ? '`Bất kỳ ai (Dùng 1 lần)`' : `<@${lockTarget}> (Đã khóa chính chủ)`}\n• Hướng dẫn: Gõ \`/redeem ma_key:${keyCode}\``
                    });
                } else {
                    const coins = parseInt(rawVal) || 50;
                    await db.execute({
                        sql: "INSERT INTO claim_keys (key_code, discord_id, provider, reward_type, reward_coins, is_used) VALUES (?, ?, 'Admin_Gift', 'COIN', ?, 0)",
                        args: [keyCode, lockTarget, coins]
                    });

                    return interaction.editReply({
                        content: `✅ **Tạo Redeem Code Coin thành công!**\n• Mã Key: \`${keyCode}\`\n• Phần thưởng: **+${coins.toLocaleString()} Coin**\n• Giới hạn sở hữu: ${lockTarget === 'GLOBAL' ? '`Bất kỳ ai (Dùng 1 lần)`' : `<@${lockTarget}> (Đã khóa chính chủ)`}`
                    });
                }
            }

            // Form: Cài Đặt Hệ Thống
            if (interaction.customId === 'modal_adm_settings') {
                const reward = parseInt(interaction.fields.getTextInputValue('inp_reward').trim());
                const limit = parseInt(interaction.fields.getTextInputValue('inp_limit').trim());
                const fee = parseInt(interaction.fields.getTextInputValue('inp_fee').trim());

                if (isNaN(reward) || isNaN(limit) || isNaN(fee)) {
                    return interaction.reply({ content: '⚠️ Các giá trị cấu hình phải là số hợp lệ!', ephemeral: true });
                }

                await interaction.deferReply({ ephemeral: true });

                await db.batch([
                    { sql: "INSERT INTO system_settings (setting_key, setting_value) VALUES ('task_reward_coins', ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value", args: [reward.toString()] },
                    { sql: "INSERT INTO system_settings (setting_key, setting_value) VALUES ('daily_task_limit', ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value", args: [limit.toString()] },
                    { sql: "INSERT INTO system_settings (setting_key, setting_value) VALUES ('trade_fee_percent', ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value", args: [fee.toString()] }
                ], 'write');

                return interaction.editReply({ content: `✅ Đã cập nhật cấu hình hệ thống:\n• Thưởng vượt link: **+${reward} Coin**\n• Giới hạn: **${limit} link/ngày**\n• Phí chuyển tiền (/pay): **${fee}%**` });
            }

            // Form: Nhập Key Nhanh từ User
            if (interaction.customId === 'modal_user_quick_redeem') {
                const keyCode = interaction.fields.getTextInputValue('inp_redeem_key').trim().toUpperCase();
                const redeemCmd = client.commands.get('redeem');

                if (redeemCmd) {
                    interaction.options = {
                        getString: () => keyCode
                    };
                    return redeemCmd.execute(interaction);
                }
            }
        }
    }
};