const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('redeem')
        .setDescription('Nhập mã Key nhận thưởng Coin từ Web GetKey')
        .addStringOption(option =>
            option.setName('ma_key')
                .setDescription('Mã Key bạn nhận được từ Web (VD: KEY-XXXX-XXXX-XXXX)')
                .setRequired(true)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const keyCode = interaction.options.getString('ma_key').trim().toUpperCase();

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

        const redeemTx = db.transaction(() => {
            db.prepare('UPDATE claim_keys SET is_used = 1 WHERE key_code = ?').run(keyCode);
            db.prepare('UPDATE global_users SET coin_balance = coin_balance + ?, daily_task_count = daily_task_count + 1 WHERE discord_id = ?').run(keyData.reward_coins, userId);
        });
        redeemTx();

        const newBalance = user.coin_balance + keyData.reward_coins;

        const embed = new EmbedBuilder()
            .setTitle('🎉 Quy Đổi Mã Key Thành Công!')
            .setColor('#10B981')
            .setDescription(`Bạn đã nhận thành công **+${keyData.reward_coins} Coin** vào tài khoản!`)
            .addFields(
                { name: '🔑 Mã Key Đã Dùng', value: `\`${keyCode}\``, inline: true },
                { name: '💰 Số Dư Mới', value: `**${newBalance.toLocaleString()}** Coin`, inline: true },
                { name: '🎯 Nhiệm Vụ Hôm Nay', value: `\`${user.daily_task_count + 1}/10\` lượt`, inline: true }
            )
            .setFooter({ text: 'Giao dịch đổi thưởng hoàn tất 100%' });

        return interaction.reply({ embeds: [embed] });
    }
};