const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Chuyển Coin cho người chơi khác')
        .addUserOption(option => 
            option.setName('nguoi_nhan')
                .setDescription('Người nhận Coin')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('so_coin')
                .setDescription('Số lượng Coin muốn chuyển (Tối thiểu 10 Coin)')
                .setRequired(true)
                .setMinValue(10)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });
        const senderId = interaction.user.id;
        const targetUser = interaction.options.getUser('nguoi_nhan');
        const amount = interaction.options.getInteger('so_coin');

        if (targetUser.bot || targetUser.id === senderId) {
            return interaction.editReply({ content: '❌ Không thể chuyển Coin cho chính mình hoặc Bot!' });
        }

        const senderRes = await db.execute({
            sql: 'SELECT * FROM global_users WHERE discord_id = ?',
            args: [senderId]
        });
        const sender = senderRes.rows[0];

        if (!sender) {
            return interaction.editReply({ content: '⚠️ Bạn chưa liên kết tài khoản! Hãy dùng `/link` trước.' });
        }

        if (sender.coin_balance < amount) {
            return interaction.editReply({ content: `❌ Số dư không đủ! Bạn chỉ có **${sender.coin_balance.toLocaleString()}** Coin.` });
        }

        const receiverRes = await db.execute({
            sql: 'SELECT * FROM global_users WHERE discord_id = ?',
            args: [targetUser.id]
        });
        const receiver = receiverRes.rows[0];

        if (!receiver) {
            return interaction.editReply({ content: `❌ Người nhận <@${targetUser.id}> chưa kích hoạt tài khoản ví!` });
        }

        const settingsRes = await db.execute("SELECT setting_value FROM system_settings WHERE setting_key = 'trade_fee_percent'");
        const feePercent = parseInt(settingsRes.rows[0]?.setting_value) || 5;

        const fee = Math.ceil(amount * (feePercent / 100));
        const netAmount = amount - fee;

        await db.batch([
            {
                sql: 'UPDATE global_users SET coin_balance = coin_balance - ? WHERE discord_id = ?',
                args: [amount, senderId]
            },
            {
                sql: 'UPDATE global_users SET coin_balance = coin_balance + ? WHERE discord_id = ?',
                args: [netAmount, targetUser.id]
            },
            {
                sql: 'INSERT INTO transactions (sender_id, receiver_id, amount, fee) VALUES (?, ?, ?, ?)',
                args: [senderId, targetUser.id, amount, fee]
            }
        ], 'write');

        const embed = new EmbedBuilder()
            .setTitle('💸 GIAO DỊCH CHUYỂN COIN THÀNH CÔNG')
            .setColor('#10B981')
            .addFields(
                { name: '👤 Người Chuyển', value: `<@${senderId}>`, inline: true },
                { name: '🎯 Người Nhận', value: `<@${targetUser.id}>`, inline: true },
                { name: '💰 Số Tiền Gửi', value: `**${amount.toLocaleString()}** Coin`, inline: false },
                { name: '📥 Thực Nhận', value: `**${netAmount.toLocaleString()}** Coin (Phí: ${feePercent}%)`, inline: true }
            )
            .setFooter({ text: 'Giao dịch được ghi nhận vào lịch sử hệ thống' })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
};