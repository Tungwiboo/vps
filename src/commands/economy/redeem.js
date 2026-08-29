const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('redeem')
        .setDescription('Nhập mã Key nhận thưởng Coin')
        .addStringOption(option =>
            option.setName('ma_key')
                .setDescription('Mã Key nhận thưởng của bạn')
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
            return interaction.reply({ content: '⚠️ Mã Key này đã được sử dụng trước đó rồi!', ephemeral: true });
        }
        if (keyData.discord_id !== 'GLOBAL' && keyData.discord_id !== userId) {
            return interaction.reply({ content: '🛑 Mã Key này không thuộc về tài khoản Discord của bạn!', ephemeral: true });
        }

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

        const embed = new EmbedBuilder()
            .setTitle('🎉 Quy Đổi Mã Key Thành Công!')
            .setColor('#10B981')
            .setDescription(`Bạn đã nhận thành công **+${keyData.reward_coins} Coin** vào tài khoản!`)
            .addFields(
                { name: '🔑 Mã Key Đã Dùng', value: `\`${keyCode}\``, inline: true },
                { name: '💰 Số Dư Mới', value: `**${newBalance.toLocaleString()}** Coin`, inline: true },
                { name: '🎯 Nhiệm Vụ Hôm Nay', value: `\`${user.daily_task_count + 1}\` lượt`, inline: true }
            )
            .setFooter({ text: 'Dữ liệu đã được cập nhật thành công lên máy chủ' });

        return interaction.reply({ embeds: [embed] });
    }
};