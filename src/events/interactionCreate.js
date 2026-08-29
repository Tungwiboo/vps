const { Events, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const crypto = require('crypto');
const db = require('../database');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        // 1. Slash Command
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`❌ Lỗi lệnh /${interaction.commandName}:`, error);
                const reply = { content: '❌ Có lỗi xảy ra khi thực thi lệnh!', ephemeral: true };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            }
        }

        // 2. Mở Modal Nhập Key
        if (interaction.isButton() && interaction.customId === 'btn_open_redeem_modal') {
            const modal = new ModalBuilder()
                .setCustomId('modal_redeem_key')
                .setTitle('Nhập Mã Key Nhận Coin');

            const keyInput = new TextInputBuilder()
                .setCustomId('input_key_code')
                .setLabel('Mã Key của bạn từ Web')
                .setPlaceholder('Ví dụ: KEY-8F92-XA10-1234')
                .setStyle(TextInputStyle.Short)
                .setMinLength(5)
                .setMaxLength(64)
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(keyInput);
            modal.addComponents(row);

            return await interaction.showModal(modal);
        }

        // 3. Xử lý Submit Key từ Modal
        if (interaction.isModalSubmit() && interaction.customId === 'modal_redeem_key') {
            const userId = interaction.user.id;
            const keyCode = interaction.fields.getTextInputValue('input_key_code').trim().toUpperCase();

            const user = db.prepare('SELECT * FROM global_users WHERE discord_id = ?').get(userId);
            if (!user) {
                return interaction.reply({ content: '⚠️ Bạn chưa liên kết tài khoản! Hãy dùng `/link` trước.', ephemeral: true });
            }

            const keyData = db.prepare('SELECT * FROM claim_keys WHERE key_code = ?').get(keyCode);
            if (!keyData) {
                return interaction.reply({ content: '❌ Mã Key không tồn tại hoặc bị nhập sai!', ephemeral: true });
            }
            if (keyData.is_used === 1) {
                return interaction.reply({ content: '⚠️ Mã Key này đã được sử dụng trước đó rồi!', ephemeral: true });
            }
            if (keyData.discord_id !== userId) {
                return interaction.reply({ content: '🛑 Mã Key này không thuộc về tài khoản Discord của bạn!', ephemeral: true });
            }

            // Ghi nhận nhà mạng đã vượt
            const completed = (user.completed_providers || '').split(',').filter(Boolean);
            if (keyData.provider && !completed.includes(keyData.provider)) {
                completed.push(keyData.provider);
            }

            const redeemTx = db.transaction(() => {
                db.prepare('UPDATE claim_keys SET is_used = 1 WHERE key_code = ?').run(keyCode);
                db.prepare(`
                    UPDATE global_users 
                    SET coin_balance = coin_balance + ?, 
                        daily_task_count = daily_task_count + 1,
                        completed_providers = ?
                    WHERE discord_id = ?
                `).run(keyData.reward_coins, completed.join(','), userId);
            });
            redeemTx();

            const newBalance = user.coin_balance + keyData.reward_coins;

            const embed = new EmbedBuilder()
                .setTitle('🎉 Quy Đổi Mã Key Thành Công!')
                .setColor('#10B981')
                .setDescription(`Bạn đã nhận thành công **+${keyData.reward_coins} Coin** vào tài khoản!`)
                .addFields(
                    { name: '🔑 Mã Key Đã Dùng', value: `\`${keyCode}\``, inline: true },
                    { name: '🌐 Cổng Link', value: `\`${keyData.provider || 'Thường'}\``, inline: true },
                    { name: '💰 Số Dư Mới', value: `**${newBalance.toLocaleString()}** Coin`, inline: true },
                    { name: '🎯 Tiến Độ Hôm Nay', value: `\`${user.daily_task_count + 1}/3\` lượt`, inline: true }
                )
                .setFooter({ text: 'Giao dịch đổi thưởng hoàn tất 100%' });

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // 4. Menu Mua Hàng /shop
        if (interaction.isStringSelectMenu() && interaction.customId === 'select_shop_item') {
            const selected = interaction.values[0];
            const userId = interaction.user.id;
            const user = db.prepare('SELECT * FROM global_users WHERE discord_id = ?').get(userId);

            let price = 0;
            let itemName = '';
            if (selected === 'key_1day_100') { price = 100; itemName = 'Key VIP Tool (1 Ngày)'; }
            if (selected === 'key_7days_500') { price = 500; itemName = 'Key VIP Tool (7 Ngày)'; }
            if (selected === 'key_30days_1500') { price = 1500; itemName = 'Key VIP Tool (30 Ngày)'; }

            if (user.coin_balance < price) {
                return interaction.reply({
                    content: `❌ Số dư không đủ! Cần **${price.toLocaleString()} Coin**, bạn chỉ có **${user.coin_balance.toLocaleString()} Coin**.`,
                    ephemeral: true
                });
            }

            const generatedKey = `VIP-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

            const buyTx = db.transaction(() => {
                db.prepare('UPDATE global_users SET coin_balance = coin_balance - ? WHERE discord_id = ?').run(price, userId);
                db.prepare('INSERT INTO user_inventory (discord_id, item_id, item_name, item_data) VALUES (?, ?, ?, ?)').run(userId, selected, itemName, generatedKey);
            });
            buyTx();

            const embed = new EmbedBuilder()
                .setTitle('🎉 Giao Dịch Mua Hàng Thành Công!')
                .setColor('#10B981')
                .setDescription(`Bạn đã mua thành công **${itemName}**.\n\n🔑 **Mã Key Của Bạn:**\n\`${generatedKey}\`\n\n*(Mã Key đã được lưu trữ an toàn trong lệnh \`/inventory\`)*`)
                .setFooter({ text: 'Cảm ơn bạn đã ủng hộ hệ thống!' });

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};