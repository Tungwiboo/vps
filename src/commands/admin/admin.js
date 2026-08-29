const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

// Hàm trích xuất Discord ID từ chuỗi nhập hoặc @tag
function extractUserId(input) {
    if (!input) return null;
    const cleanId = input.replace(/[<@!>]/g, '').trim();
    return /^\d{17,20}$/.test(cleanId) ? cleanId : null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Bảng điều khiển quản trị viên (Admin Panel)')
        // Lớp 1: Ẩn lệnh khỏi menu gợi ý của người dùng thường trên Discord
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

        // Subcommand: Cộng Coin
        .addSubcommand(sub =>
            sub.setName('addcoin')
                .setDescription('Cộng thêm Coin cho người dùng')
                .addStringOption(opt =>
                    opt.setName('nguoi_dung')
                        .setDescription('Discord ID hoặc @Tag')
                        .setRequired(true))
                .addIntegerOption(opt =>
                    opt.setName('so_coin')
                        .setDescription('Số Coin muốn cộng')
                        .setRequired(true)
                        .setMinValue(1)))

        // Subcommand: Set Coin
        .addSubcommand(sub =>
            sub.setName('setcoin')
                .setDescription('Đặt số dư Coin cố định')
                .addStringOption(opt =>
                    opt.setName('nguoi_dung')
                        .setDescription('Discord ID hoặc @Tag')
                        .setRequired(true))
                .addIntegerOption(opt =>
                    opt.setName('so_coin')
                        .setDescription('Số Coin muốn đặt')
                        .setRequired(true)
                        .setMinValue(0)))

        // Subcommand: Reset nhiệm vụ
        .addSubcommand(sub =>
            sub.setName('resettask')
                .setDescription('Đặt lại lượt nhiệm vụ hôm nay về 0/10')
                .addStringOption(opt =>
                    opt.setName('nguoi_dung')
                        .setDescription('Discord ID hoặc @Tag')
                        .setRequired(true)))

        // Subcommand: Tra cứu thông tin DB
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('Tra cứu chi tiết Database')
                .addStringOption(opt =>
                    opt.setName('nguoi_dung')
                        .setDescription('Discord ID hoặc @Tag')
                        .setRequired(true))),

    async execute(interaction) {
        // Lớp 2: Kiểm tra cứng Discord ID trong file .env
        const allowedAdmins = process.env.ADMIN_ID ? process.env.ADMIN_ID.split(',').map(id => id.trim()) : [];
        const isSuperAdmin = allowedAdmins.includes(interaction.user.id);

        if (!isSuperAdmin) {
            return interaction.reply({
                content: '🚫 **Truy Cập Bị Từ Chối:** Bạn không có quyền sử dụng lệnh quản trị này!',
                ephemeral: true
            });
        }

        const subCommand = interaction.options.getSubcommand();
        const userInput = interaction.options.getString('nguoi_dung');
        const targetId = extractUserId(userInput);

        if (!targetId) {
            return interaction.reply({
                content: '❌ Định dạng Discord ID không hợp lệ! Vui lòng nhập đúng dãy 18-19 chữ số hoặc @tag người dùng.',
                ephemeral: true
            });
        }

        let user = db.prepare('SELECT * FROM global_users WHERE discord_id = ?').get(targetId);

        // Nếu người dùng chưa có trong DB -> Tự động khởi tạo luôn
        if (!user) {
            let fetchedUsername = 'User_' + targetId.slice(-4);
            try {
                const fetched = await interaction.client.users.fetch(targetId);
                if (fetched) fetchedUsername = fetched.username;
            } catch (e) {}

            db.prepare('INSERT INTO global_users (discord_id, username, coin_balance) VALUES (?, ?, 0)').run(targetId, fetchedUsername);
            user = db.prepare('SELECT * FROM global_users WHERE discord_id = ?').get(targetId);
        }

        // ================= XỬ LÝ LỆNH =================

        if (subCommand === 'addcoin') {
            const amount = interaction.options.getInteger('so_coin');
            db.prepare('UPDATE global_users SET coin_balance = coin_balance + ? WHERE discord_id = ?').run(amount, targetId);
            const newBal = user.coin_balance + amount;

            const embed = new EmbedBuilder()
                .setTitle('⚙️ [ADMIN] Đã Cộng Coin')
                .setColor('#10B981')
                .addFields(
                    { name: '👤 Người Nhận', value: `<@${targetId}> (\`${targetId}\`)`, inline: true },
                    { name: '➕ Số Coin Thêm', value: `\`+${amount.toLocaleString()} Coin\``, inline: true },
                    { name: '💰 Số Dư Sau Thay Đổi', value: `**${newBal.toLocaleString()}** Coin`, inline: false }
                )
                .setFooter({ text: `Thực hiện bởi Admin: ${interaction.user.username}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subCommand === 'setcoin') {
            const amount = interaction.options.getInteger('so_coin');
            db.prepare('UPDATE global_users SET coin_balance = ? WHERE discord_id = ?').run(amount, targetId);

            const embed = new EmbedBuilder()
                .setTitle('⚙️ [ADMIN] Đã Đặt Lại Số Dư')
                .setColor('#F59E0B')
                .addFields(
                    { name: '👤 Mục Tiêu', value: `<@${targetId}> (\`${targetId}\`)`, inline: true },
                    { name: '💰 Số Dư Mới', value: `**${amount.toLocaleString()}** Coin`, inline: true }
                )
                .setFooter({ text: `Thực hiện bởi Admin: ${interaction.user.username}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subCommand === 'resettask') {
            const today = new Date().toISOString().split('T')[0];
            db.prepare('UPDATE global_users SET daily_task_count = 0, last_task_date = ? WHERE discord_id = ?').run(today, targetId);

            const embed = new EmbedBuilder()
                .setTitle('⚙️ [ADMIN] Đã Reset Lượt Nhiệm Vụ')
                .setColor('#3B82F6')
                .setDescription(`Đã làm mới lượt nhiệm vụ hôm nay của <@${targetId}> (\`${targetId}\`) về **0/10** lượt.`)
                .setFooter({ text: `Thực hiện bởi Admin: ${interaction.user.username}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subCommand === 'info') {
            const inventory = db.prepare('SELECT COUNT(*) as count FROM user_inventory WHERE discord_id = ?').get(targetId);

            const embed = new EmbedBuilder()
                .setTitle(`🔍 [ADMIN] Tra Cứu Dữ Liệu: ${user.username}`)
                .setColor('#8B5CF6')
                .addFields(
                    { name: '🆔 Discord ID', value: `\`${user.discord_id}\``, inline: true },
                    { name: '👤 Tên DB', value: user.username, inline: true },
                    { name: '💰 Số Dư Coin', value: `**${user.coin_balance.toLocaleString()}** Coin`, inline: true },
                    { name: '🎯 Nhiệm Vụ Hôm Nay', value: `\`${user.daily_task_count}/10\` lượt`, inline: true },
                    { name: '🎒 Túi Đồ', value: `\`${inventory.count}\` vật phẩm`, inline: true },
                    { name: '📅 Ngày Đăng Ký', value: `\`${new Date(user.created_at).toLocaleDateString('vi-VN')}\``, inline: true }
                )
                .setFooter({ text: `Tra cứu bởi Admin: ${interaction.user.username}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};