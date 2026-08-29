const crypto = require('crypto');
const db = require('../database');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        // 1. Xử lý Slash Commands
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error('Lỗi thực thi lệnh:', error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: '❌ Có lỗi xảy ra khi thực thi lệnh!', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ Có lỗi xảy ra khi thực thi lệnh!', ephemeral: true });
                }
            }
        }

        // 2. Xử lý dữ liệu gửi từ Modal Admin
        if (interaction.isModalSubmit()) {
            // A. Cấu hình kinh tế
            if (interaction.customId === 'modal_config_system') {
                const reward = interaction.fields.getTextInputValue('cfg_reward');
                const limit = interaction.fields.getTextInputValue('cfg_limit');
                const fee = interaction.fields.getTextInputValue('cfg_fee');

                await db.batch([
                    { sql: "INSERT OR REPLACE INTO system_settings (setting_key, setting_value) VALUES ('task_reward_coins', ?)", args: [reward] },
                    { sql: "INSERT OR REPLACE INTO system_settings (setting_key, setting_value) VALUES ('daily_task_limit', ?)", args: [limit] },
                    { sql: "INSERT OR REPLACE INTO system_settings (setting_key, setting_value) VALUES ('trade_fee_percent', ?)", args: [fee] }
                ], 'write');

                return interaction.reply({
                    content: `✅ **Đã cập nhật cài đặt thành công:**\n• Thưởng vượt link: **+${reward} Coin**\n• Giới hạn vượt: **${limit} lần/ngày**\n• Phí chuyển tiền: **${fee}%**`,
                    ephemeral: true
                });
            }

            // B. Tạo mã Key nhận thưởng
            if (interaction.customId === 'modal_create_key') {
                const coins = parseInt(interaction.fields.getTextInputValue('key_coins')) || 50;
                const keyCode = 'KEY-GIFT-' + crypto.randomBytes(4).toString('hex').toUpperCase();

                await db.execute({
                    sql: "INSERT INTO claim_keys (key_code, discord_id, reward_coins, provider) VALUES (?, 'GLOBAL', ?, 'Admin_Gift')",
                    args: [keyCode, coins]
                });

                return interaction.reply({
                    content: `🎉 **Đã tạo mã Key nhận thưởng:**\n\n• Mã Key: \`${keyCode}\`\n• Trị giá: **+${coins} Coin**\n• Thành viên có thể dùng lệnh \`/redeem\` để nhận thưởng.`,
                    ephemeral: true
                });
            }

            // C. Thêm vật phẩm vào Shop
            if (interaction.customId === 'modal_add_shop_item') {
                const id = interaction.fields.getTextInputValue('item_id').trim();
                const name = interaction.fields.getTextInputValue('item_name').trim();
                const price = parseInt(interaction.fields.getTextInputValue('item_price')) || 100;
                const type = interaction.fields.getTextInputValue('item_reward_type').trim().toUpperCase();
                const data = interaction.fields.getTextInputValue('item_reward_data') || '';

                await db.execute({
                    sql: `INSERT OR REPLACE INTO shop_items (item_id, item_name, price, reward_type, reward_data) VALUES (?, ?, ?, ?, ?)`,
                    args: [id, name, price, type, data]
                });

                return interaction.reply({
                    content: `🛒 **Đã lưu mặt hàng vào Shop thành công!**\n• **Tên:** ${name}\n• **Giá:** ${price} Coin\n• **Phân loại:** \`${type}\``,
                    ephemeral: true
                });
            }

            // D. Cấp đặc quyền VIP
            if (interaction.customId === 'modal_grant_perk') {
                const targetId = interaction.fields.getTextInputValue('perk_target').trim();
                const perkType = interaction.fields.getTextInputValue('perk_type').trim().toUpperCase();
                const days = parseInt(interaction.fields.getTextInputValue('perk_days')) || 7;
                const expiresAt = Math.floor(Date.now() / 1000) + (days * 86400);

                await db.execute({
                    sql: "INSERT INTO user_perks (discord_id, perk_type, perk_value, expires_at) VALUES (?, ?, 'ACTIVE', ?)",
                    args: [targetId, perkType, expiresAt]
                });

                return interaction.reply({
                    content: `👑 Đã cấp đặc quyền **${perkType}** cho thành viên <@${targetId}> thời hạn **${days} ngày**!`,
                    ephemeral: true
                });
            }
        }
    }
};