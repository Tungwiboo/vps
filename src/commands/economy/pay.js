const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Chuyển Coin cho người chơi khác (Phí giao dịch 5%)')
        .addUserOption(option => 
            option.setName('nguoi_nhan')
                .setDescription('Người nhận Coin')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('so_coin')
                .setDescription('Số lượng Coin muốn chuyển (Tối thiểu 1000 Coin)')
                .setRequired(true)
                .setMinValue(1000)),

    async execute(interaction) {
        const senderId = interaction.user.id;
        const targetUser = interaction.options.getUser('nguoi_nhan');
        const amount = interaction.options.getInteger('so_coin');

        if (targetUser.bot || targetUser.id === senderId) {
            return interaction.reply({ content: '❌ Không thể chuyển Coin cho chính mình hoặc Bot!', ephemeral: true });
        }

        const senderRes = await db.execute({
            sql: 'SELECT * FROM global_users WHERE discord_id = ?',
            args: [senderId]
        });
        const sender = senderRes.rows[0];

        if (!sender) {
            return interaction.reply({ content: '⚠️ Bạn chưa liên kết tài khoản! Hãy dùng `/link` trước.', ephemeral: true });
        }

        if (sender.coin_balance < amount) {
            return interaction.reply({ 
                content: `❌ Số dư không đủ! Bạn chỉ có **${sender.coin_balance.toLocaleString()}** Coin.`, 
                ephemeral: true 
            });
        }

        const receiverRes = await db.execute({
            sql: 'SELECT * FROM global_users WHERE discord_id = ?',
            args: [targetUser.id]
        });
        const receiver = receiverRes.rows[0];

        if (!receiver) {
            return interaction.reply({ 
                content: `❌ Người nhận <@${targetUser.id}> chưa từng liên kết tài khoản (chưa dùng \`/link\`)!`, 
                ephemeral: true 
            });
        }

        const fee = Math.ceil(amount * 0.05);
        const netAmount = amount - fee;

        // Dùng db.batch để thực thi atomic transaction trên Turso
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
            .setTitle('💸 Giao Dịch Chuyển Coin Thành Công')
            .setColor('#10B981')
            .addFields(
                { name: '👤 Người Gửi', value: `<@${senderId}>`, inline: true },
                { name: '🎯 Người Nhận', value: `<@${targetUser.id}>`, inline: true },
                { name: '💰 Số Tiền Chuyển', value: `**${amount.toLocaleString()}** Coin`, inline: false },
                { name: '📥 Thực Nhận (-5% phí)', value: `**${netAmount.toLocaleString()}** Coin`, inline: true },
                { name: '🏷️ Phí Sàn', value: `\`${fee.toLocaleString()} Coin\``, inline: true }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};