const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('redeem')
        .setDescription('Kích hoạt mã Key nhận Coin hoặc cấp Role VIP')
        .addStringOption(option =>
            option.setName('ma_key')
                .setDescription('Nhập mã Key (Key vượt link, Key quà tặng hoặc Key VIP)')
                .setRequired(true)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const keyCode = interaction.options.getString('ma_key').trim().toUpperCase();

        const userRes = await db.execute({
            sql: 'SELECT * FROM global_users WHERE discord_id = ?',
            args: [userId]
        });
        const user = userRes.rows[0];

        if (!user) {
            return interaction.reply({ content: '⚠️ Bạn chưa liên kết tài khoản! Hãy dùng `/link` trước.', ephemeral: true });
        }

        const keyRes = await db.execute({
            sql: 'SELECT * FROM claim_keys WHERE key_code = ?',
            args: [keyCode]
        });
        const keyData = keyRes.rows[0];

        if (!keyData) {
            return interaction.reply({ content: '❌ Mã Key không tồn tại hoặc bị nhập sai!', ephemeral: true });
        }
        if (keyData.is_used === 1) {
            return interaction.reply({ content: '⚠️ Mã Key này đã được kích hoạt trước đó rồi!', ephemeral: true });
        }
        if (keyData.discord_id !== 'GLOBAL' && keyData.discord_id !== userId) {
            return interaction.reply({ content: '🛑 Mã Key này không thuộc quyền sở hữu của bạn!', ephemeral: true });
        }

        // 1. KÍCH HOẠT KEY CẤP ROLE VIP
        if (keyData.reward_type === 'ROLE_VIP') {
            const roleId = keyData.reward_role_id;
            let roleSuccess = false;
            let roleMsg = '';

            if (interaction.guild) {
                try {
                    const member = await interaction.guild.members.fetch(userId);
                    const role = interaction.guild.roles.cache.get(roleId);

                    if (role) {
                        await member.roles.add(role);
                        roleSuccess = true;
                        roleMsg = `👑 Đã gắn thành công Role **${role.name}** cho bạn!`;
                    } else {
                        roleMsg = `⚠️ Role (ID: \`${roleId}\`) không tồn tại trong server này. Vui lòng liên hệ Admin.`;
                    }
                } catch (err) {
                    roleMsg = `⚠️ Bot thiếu quyền để gán Role. Hãy kiểm tra thứ tự Role của Bot trong Server Settings!`;
                }
            } else {
                roleMsg = `⚠️ Bạn cần dùng lệnh này trong Server có Role để Bot cấp quyền trực tiếp.`;
            }

            await db.execute({
                sql: 'UPDATE claim_keys SET is_used = 1 WHERE key_code = ?',
                args: [keyCode]
            });

            const embedVIP = new EmbedBuilder()
                .setTitle('👑 KÍCH HOẠT ĐẶC QUYỀN VIP THÀNH CÔNG!')
                .setColor('#F59E0B')
                .setDescription(`Chúc mừng bạn đã kích hoạt thành công gói đặc quyền VIP!\n\n${roleMsg}`)
                .addFields(
                    { name: '🔑 Mã Key Đã Dùng', value: `\`${keyCode}\``, inline: true },
                    { name: '👤 Người Sở Hữu', value: `<@${userId}>`, inline: true }
                )
                .setFooter({ text: 'Đặc quyền đã được kích hoạt vĩnh viễn' })
                .setTimestamp();

            return interaction.reply({ embeds: [embedVIP] });
        }

        // 2. KÍCH HOẠT KEY COIN THƯỜNG / VƯỢT LINK
        await db.batch([
            {
                sql: 'UPDATE claim_keys SET is_used = 1 WHERE key_code = ?',
                args: [keyCode]
            },
            {
                sql: 'UPDATE global_users SET coin_balance = coin_balance + ?, daily_task_count = daily_task_count + 1, total_links_completed = total_links_completed + 1 WHERE discord_id = ?',
                args: [keyData.reward_coins, userId]
            }
        ], 'write');

        const newBalance = user.coin_balance + keyData.reward_coins;

        const embedCoin = new EmbedBuilder()
            .setTitle('🎉 QUY ĐỔI COIN THÀNH CÔNG!')
            .setColor('#10B981')
            .setDescription(`Nhận thành công **+${keyData.reward_coins.toLocaleString()} Coin** vào tài khoản ví!`)
            .addFields(
                { name: '🔑 Mã Key', value: `\`${keyCode}\``, inline: true },
                { name: '💰 Số Dư Mới', value: `**${newBalance.toLocaleString()}** Coin`, inline: true },
                { name: '🎯 Nhiệm Vụ Hôm Nay', value: `\`${user.daily_task_count + 1}\` lượt`, inline: true }
            )
            .setFooter({ text: 'Giao dịch quy đổi hoàn tất' })
            .setTimestamp();

        return interaction.reply({ embeds: [embedCoin] });
    }
};