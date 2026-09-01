require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const webApp = require('./server');

// 1. Mở Port Web Server ngay lập tức cho Render
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

// Quét toàn bộ thư mục commands
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
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commandsJson.push(command.data.toJSON());
    }
}
console.log(`📦 Đã nạp ${client.commands.size} lệnh vào bộ nhớ Bot.`);

// Nạp các file sự kiện trong events
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
    }
}

// Báo trạng thái Bot Online
client.once('ready', () => {
    console.log(`🤖 Discord Bot ĐÃ SẴN SÀNG NHẬN LỆNH: ${client.user.tag}`);
});

// 3. Tự động đồng bộ Slash Commands chạy nền
(async () => {
    if (!process.env.CLIENT_ID || !process.env.DISCORD_TOKEN) return;
    try {
        const rest = new REST({ timeout: 15000 }).setToken(process.env.DISCORD_TOKEN);
        if (process.env.GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commandsJson }
            );
        } else {
            await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commandsJson }
            );
        }
        console.log(`✅ Đã đồng bộ ${commandsJson.length} lệnh Slash Commands lên Discord!`);
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

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ Lỗi đăng nhập Discord Token:', err.message);
});