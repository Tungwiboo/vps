const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('redeem')
        .setDescription('Kích hoạt mã Key nhận Coin, Role VIP hoặc Role Độc Quyền')
        .addStringOption(option =>
            option.setName('ma_key')
                .setDescription('Nhập chính xác mã Key cần kích hoạt')
                .setRequired(true)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const keyCode = interaction.options.getString('ma_key').trim().toUpperCase();

        await interaction.deferReply({ ephemeral: true });

        // 1. Kiểm tra tài khoản đã /link chưa
        const userRes = await db.execute({
            sql: 'SELECT * FROM global_users WHERE discord_id = ?',
            args: [userId]
        });
        const user = userRes.rows[0];

        if (!user) {
            return interaction.editReply({ content: '⚠️ Bạn chưa liên kết tài khoản ví! Hãy dùng lệnh `/link` trước.' });
        }

        // 2. Tra cứu mã Key trong cơ sở dữ liệu
        const keyRes = await db.execute({
            sql: 'SELECT * FROM claim_keys WHERE key_code = ?',
            args: [keyCode]
        });
        const keyData = keyRes.rows[0];

        if (!keyData) {
            return interaction.editReply({ content: '❌ Mã Key không tồn tại hoặc đã bị nhập sai!' });
        }

        // 3. Kiểm tra mã chỉ dùng 1 lần
        if (keyData.is_used === 1) {
            return interaction.editReply({ content: '⚠️ Mã Key này **đã được sử dụng trước đó** rồi!' });
        }

        // 4. Kiểm tra quyền sở hữu (Chỉ người mua/nhận mới được dùng)
        if (keyData.discord_id !== 'GLOBAL' && keyData.discord_id !== userId) {
            return interaction.editReply({ content: '🛑 **Từ chối kích hoạt:** Mã Key này đã được khóa theo tài khoản của người khác!' });
        }

        // ========================================================
        // TRƯỜNG HỢP A: KEY CẤP ROLE (ROLE VIP / ROLE ĐỘC QUYỀN)
        // ========================================================
        if (['ROLE_VIP', 'ROLE_EXCLUSIVE', 'ROLE'].includes(keyData.reward_type) || keyData.reward_role_id) {
            if (!interaction.guild) {
                return interaction.editReply({ content: '⚠️ Bạn phải dùng lệnh `/redeem` bên trong Máy chủ Discord để Bot gán Role trực tiếp!' });
            }

            const roleId = keyData.reward_role_id;
            const targetRole = interaction.guild.roles.cache.get(roleId);

            if (!targetRole) {
                return interaction.editReply({ 
                    content: `⚠️ Không tìm thấy Role có ID \`${roleId}\` trên máy chủ này! Vui lòng liên hệ Quản trị viên.` 
                });
            }

            try {
                const member = await interaction.guild.members.fetch(userId);
                await member.roles.add(targetRole);
            } catch (err) {
                console.error('Lỗi gán role:', err);
                return interaction.editReply({ 
                    content: `⚠️ Bot thiếu quyền để gán Role **${targetRole.name}**! Hãy đảm bảo thứ tự Role của Bot nằm trên Role này trong cài đặt Server.` 
                });
            }

            // Đánh dấu Key đã sử dụng
            await db.execute({
                sql: 'UPDATE claim_keys SET is_used = 1 WHERE key_code = ?',
                args: [keyCode]
            });

            const embedRole = new EmbedBuilder()
                .setTitle('👑 KÍCH HOẠT ROLE ĐẶC QUYỀN THÀNH CÔNG!')
                .setColor('#F59E0B')
                .setDescription(`Chúc mừng bạn đã kích hoạt thành công gói quyền lợi Role!\n\n🏷️ **Role đã nhận:** <@&${roleId}>\n🔑 **Mã Key:** \`${keyCode}\``)
                .addFields(
                    { name: '👤 Người Nhận', value: `<@${userId}>`, inline: true },
                    { name: '📅 Thời Gian', value: `\`${new Date().toLocaleString('vi-VN')}\``, inline: true }
                )
                .setFooter({ text: 'Mã Key đã được đánh dấu sử dụng và vô hiệu hóa vĩnh viễn' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embedRole] });
        }

        // ========================================================
        // TRƯỜNG HỢP B: KEY NHẬN COIN THƯỜNG / VƯỢT LINK
        // ========================================================
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
                { name: '🔑 Mã Key Đã Dùng', value: `\`${keyCode}\``, inline: true },
                { name: '💰 Số Dư Mới', value: `**${newBalance.toLocaleString()}** Coin`, inline: true }
            )
            .setFooter({ text: 'Mã Key đã được đánh dấu sử dụng' })
            .setTimestamp();

        return interaction.editReply({ embeds: [embedCoin] });
    }
};