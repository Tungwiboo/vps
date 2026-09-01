require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const webApp = require('./server');

// 1. Mở Port Web Server cho Render ngay lập tức
const PORT = process.env.PORT || 10000;
webApp.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web Server đang chạy tại cổng: ${PORT}`);
});

// 2. Làm sạch chuỗi Token (Xóa dấu cách, dấu ngoặc kép thừa nếu có)
const rawToken = process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.trim().replace(/^["']|["']$/g, '') : '';
const rawClientId = process.env.CLIENT_ID ? process.env.CLIENT_ID.trim().replace(/^["']|["']$/g, '') : '';
const rawGuildId = process.env.GUILD_ID ? process.env.GUILD_ID.trim().replace(/^["']|["']$/g, '') : '';

if (!rawToken) {
    console.error('❌ LỖI: Biến DISCORD_TOKEN trên Render đang bị trống!');
}

// 3. Khởi tạo Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

client.commands = new Collection();
const commandsJson = [];

// Quét đệ quy toàn bộ thư mục commands
function getCommandFiles(dir) {
    let files = [];
    if (!fs.existsSync(dir)) return files;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            files = files.concat(getCommandFiles(fullPath));
        } else if (item.name.endsWith('.js')) {
            files.push(fullPath);
        }
    }
    return files;
}

const commandFiles = getCommandFiles(path.join(__dirname, 'commands'));
for (const filePath of commandFiles) {
    try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            commandsJson.push(command.data.toJSON());
        }
    } catch (err) {
        console.error(`⚠️ Lỗi khi nạp file ${filePath}:`, err.message);
    }
}
console.log(`📦 Đã nạp thành công ${client.commands.size} lệnh.`);

// Nạp Events
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        try {
            const filePath = path.join(eventsPath, file);
            const event = require(filePath);
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args, client));
            } else {
                client.on(event.name, (...args) => event.execute(...args, client));
            }
        } catch (err) {
            console.error(`⚠️ Lỗi nạp event ${file}:`, err.message);
        }
    }
}

// Lắng nghe trạng thái đăng nhập
client.once('ready', (c) => {
    console.log(`🚀 [GATEWAY OK] Bot ĐÃ ONLINE THÀNH CÔNG: ${c.user.tag}`);
});

// Bắt lỗi kết nối Discord
client.on('error', (err) => {
    console.error('❌ Lỗi Discord Client:', err.message);
});

// 4. Đồng bộ Slash Commands
(async () => {
    if (!rawClientId || !rawToken) return;
    try {
        const rest = new REST({ timeout: 15000 }).setToken(rawToken);
        if (rawGuildId) {
            await rest.put(
                Routes.applicationGuildCommands(rawClientId, rawGuildId),
                { body: commandsJson }
            );
            console.log(`✅ Đã đồng bộ ${commandsJson.length} lệnh cho Server Guild ID: ${rawGuildId}`);
        } else {
            await rest.put(
                Routes.applicationCommands(rawClientId),
                { body: commandsJson }
            );
            console.log(`✅ Đã đồng bộ ${commandsJson.length} lệnh toàn cục (Global).`);
        }
    } catch (err) {
        console.error('⚠️ Lỗi đồng bộ Slash Commands:', err.message);
    }
})();

// Chống crash
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ [Anti-Crash] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ [Anti-Crash] Uncaught Exception:', err);
});

// Đăng nhập bot
client.login(rawToken).catch(err => {
    console.error('❌ LỖI ĐĂNG NHẬP DISCORD TOKEN:', err.message);
    console.error('👉 Hãy vào Developer Portal kiểm tra xem Token có bị Reset không!');
});