const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('redeem')
        .setDescription('Kích hoạt mã Key nhận Coin hoặc Role VIP')
        .addStringOption(option =>
            option.setName('ma_key')
                .setDescription('Nhập chính xác mã Key cần kích hoạt')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.user.id;
        const cleanKey = interaction.options.getString('ma_key').trim().toUpperCase();

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
            console.error('❌ Lỗi xử lý /redeem:', err);
            return interaction.editReply({ content: '⚠️ Đã xảy ra lỗi khi kích hoạt Key!' });
        }
    }
};