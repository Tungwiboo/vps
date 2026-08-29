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
                .setDescription('Số lượng Coin muốn chuyển (Tối thiểu 10 Coin)')
                .setRequired(true)
                .setMinValue(10)),

    async execute(interaction) {
        const senderId = interaction.user.id;
        const targetUser = interaction.options.getUser('nguoi_nhan');
        const amount = interaction.options.getInteger('so_coin');

        if (targetUser.bot || targetUser.id === senderId) {
            return interaction.reply({ content: '❌ Không thể chuyển Coin cho chính mình hoặc Bot!', ephemeral: true });
        }

        const sender = db.prepare('SELECT * FROM global_users WHERE discord_id = ?').get(senderId);
        if (!sender) {
            return interaction.reply({ content: '⚠️ Bạn chưa liên kết tài khoản! Hãy dùng `/link` trước.', ephemeral: true });
        }

        if (sender.coin_balance < amount) {
            return interaction.reply({ 
                content: `❌ Số dư không đủ! Bạn chỉ có **${sender.coin_balance.toLocaleString()}** Coin.`, 
                ephemeral: true 
            });
        }

        const receiver = db.prepare('SELECT * FROM global_users WHERE discord_id = ?').get(targetUser.id);
        if (!receiver) {
            return interaction.reply({ 
                content: `❌ Người nhận <@${targetUser.id}> chưa từng liên kết tài khoản (chưa dùng \`/link\`)!`, 
                ephemeral: true 
            });
        }

        const fee = Math.ceil(amount * 0.05);
        const netAmount = amount - fee;

        const transferTx = db.transaction(() => {
            db.prepare('UPDATE global_users SET coin_balance = coin_balance - ? WHERE discord_id = ?').run(amount, senderId);
            db.prepare('UPDATE global_users SET coin_balance = coin_balance + ? WHERE discord_id = ?').run(netAmount, targetUser.id);
            db.prepare('INSERT INTO transactions (sender_id, receiver_id, amount, fee) VALUES (?, ?, ?, ?)').run(senderId, targetUser.id, amount, fee);
        });
        transferTx();

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