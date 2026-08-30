const crypto = require('crypto');
const db = require('../database');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error('Lỗi lệnh:', error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: '❌ Có lỗi xảy ra khi thực thi lệnh!', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ Có lỗi xảy ra khi thực thi lệnh!', ephemeral: true });
                }
            }
        }

        if (interaction.isModalSubmit()) {
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
                    content: `✅ **Đã cập nhật cài đặt:**\n• Thưởng vượt link: **+${reward} Coin**\n• Giới hạn: **${limit} lần/ngày**\n• Phí chuyển tiền: **${fee}%**`,
                    ephemeral: true
                });
            }

            if (interaction.customId === 'modal_create_key') {
                const keyType = interaction.fields.getTextInputValue('key_type').trim().toUpperCase();
                const keyValue = interaction.fields.getTextInputValue('key_value').trim();

                const keyCode = (keyType === 'ROLE_VIP' ? 'VIP-' : 'GIFT-') + crypto.randomBytes(4).toString('hex').toUpperCase();

                if (keyType === 'ROLE_VIP') {
                    await db.execute({
                        sql: "INSERT INTO claim_keys (key_code, discord_id, provider, reward_type, reward_role_id, reward_coins) VALUES (?, 'GLOBAL', 'Admin_Gift', 'ROLE_VIP', ?, 0)",
                        args: [keyCode, keyValue]
                    });
                    return interaction.reply({
                        content: `🎉 **Đã tạo mã Key ROLE VIP!**\n\n• Mã Key: \`${keyCode}\`\n• Role ID cấp: \`${keyValue}\`\n• Người dùng dùng lệnh \`/redeem\` để nhận Role.`,
                        ephemeral: true
                    });
                } else {
                    const coins = parseInt(keyValue) || 50;
                    await db.execute({
                        sql: "INSERT INTO claim_keys (key_code, discord_id, provider, reward_type, reward_coins) VALUES (?, 'GLOBAL', 'Admin_Gift', 'COIN', ?)",
                        args: [keyCode, coins]
                    });
                    return interaction.reply({
                        content: `🎉 **Đã tạo mã Key COIN!**\n\n• Mã Key: \`${keyCode}\`\n• Trị giá: **+${coins} Coin**\n• Người dùng dùng lệnh \`/redeem\` để nhận Coin.`,
                        ephemeral: true
                    });
                }
            }

            if (interaction.customId === 'modal_add_shop_item') {
                const id = interaction.fields.getTextInputValue('item_id').trim();
                const name = interaction.fields.getTextInputValue('item_name').trim();
                const price = parseInt(interaction.fields.getTextInputValue('item_price')) || 100;
                const type = interaction.fields.getTextInputValue('item_reward_type').trim().toUpperCase();
                const data = interaction.fields.getTextInputValue('item_reward_data').trim();

                await db.execute({
                    sql: `INSERT OR REPLACE INTO shop_items (item_id, item_name, price, reward_type, reward_data) VALUES (?, ?, ?, ?, ?)`,
                    args: [id, name, price, type, data]
                });

                return interaction.reply({
                    content: `🛒 **Đã thêm/sửa mặt hàng trong Shop:**\n• **Tên:** ${name}\n• **Giá:** ${price} Coin\n• **Phân loại:** \`${type}\``,
                    ephemeral: true
                });
            }
        }
    }
};