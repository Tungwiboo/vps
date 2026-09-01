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

// 2. Khởi tạo Discord Client
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

// 3. Tự động đồng bộ Slash Commands chạy nền
(async () => {
    const token = (process.env.DISCORD_TOKEN || '').trim().replace(/^["']|["']$/g, '');
    const clientId = (process.env.CLIENT_ID || '').trim().replace(/^["']|["']$/g, '');
    const guildId = (process.env.GUILD_ID || '').trim().replace(/^["']|["']$/g, '');

    if (!clientId || !token) return;
    try {
        const rest = new REST({ timeout: 15000 }).setToken(token);
        if (guildId) {
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commandsJson }
            );
            console.log(`✅ Đã đồng bộ ${commandsJson.length} Slash Commands cho Server Guild ID: ${guildId}`);
        } else {
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: commandsJson }
            );
            console.log(`✅ Đã đồng bộ ${commandsJson.length} Slash Commands toàn cục.`);
        }
    } catch (err) {
        console.error('⚠️ Lỗi đồng bộ Slash Commands:', err.message);
    }
})();

// Bắt lỗi sập tiến trình
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ [Anti-Crash] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ [Anti-Crash] Uncaught Exception:', err);
});

const cleanedToken = (process.env.DISCORD_TOKEN || '').trim().replace(/^["']|["']$/g, '');
client.login(cleanedToken).catch(err => {
    console.error('❌ LỖI ĐĂNG NHẬP DISCORD TOKEN:', err.message);
});