require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const webApp = require('./server');

// 1. Mở Port ngay lập tức
const PORT = process.env.PORT || 10000;
webApp.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [RENDER PORT] Server đang chạy tại port: ${PORT}`);
});

// 2. Khởi tạo Bot Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

client.commands = new Collection();
const commandsJson = [];

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
        console.error(`❌ Lỗi nạp file lệnh ${filePath}:`, err.message);
    }
}
console.log(`📦 Đã nạp thành công ${client.commands.size} lệnh vào bộ nhớ.`);

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
            console.error(`❌ Lỗi nạp event ${file}:`, err.message);
        }
    }
}

// Báo trạng thái đăng nhập
client.once('ready', (c) => {
    console.log(`🚀 [DISCORD READY] BOT ĐÃ ONLINE 100%: ${c.user.tag}`);
});

// 3. Đăng ký Slash Command lên Server tức thì
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
            console.log(`⚡ [SLASH COMMANDS] Đã đồng bộ ${commandsJson.length} lệnh trực tiếp cho Server: ${guildId}`);
        } else {
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: commandsJson }
            );
            console.log(`🌐 [SLASH COMMANDS] Đã đồng bộ ${commandsJson.length} lệnh Global (có thể trễ).`);
        }
    } catch (err) {
        console.error('⚠️ Lỗi đồng bộ Slash Commands:', err.message);
    }
})();

// Bắt lỗi crash
process.on('unhandledRejection', (reason) => console.error('⚠️ Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.error('⚠️ Uncaught Exception:', err));

const tokenToLogin = (process.env.DISCORD_TOKEN || '').trim().replace(/^["']|["']$/g, '');
client.login(tokenToLogin).catch(err => {
    console.error('❌ [LOGIN FAILED] Không thể đăng nhập Discord Token:', err.message);
});