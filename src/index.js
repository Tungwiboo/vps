require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const webApp = require('./server');

// 1. Mở Port Web Server cho Render
const PORT = process.env.PORT || 10000;
webApp.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [PORT CHECK] Web Server đang lắng nghe tại cổng: ${PORT}`);
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
    try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            commandsJson.push(command.data.toJSON());
            console.log(`  └─ [LOAD CMD OK] /${command.data.name} (${path.relative(__dirname, filePath)})`);
        } else {
            console.error(`  └─ [LOAD CMD LỖI] File thiếu data/execute: ${filePath}`);
        }
    } catch (err) {
        console.error(`  └─ [CRASH LOAD FILE] Lỗi require file ${filePath}:`, err);
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
            console.log(`  └─ [LOAD EVENT OK] ${event.name} (${file})`);
        } catch (err) {
            console.error(`  └─ [CRASH LOAD EVENT] Lỗi nạp event ${file}:`, err);
        }
    }
}

// Bẫy lỗi Gateway & Network
client.once('ready', (c) => {
    console.log(`\n======================================================`);
    console.log(`🚀 [DISCORD READY] BOT ĐÃ LOGIN THÀNH CÔNG: ${c.user.tag}`);
    console.log(`🆔 Bot Application ID: ${c.user.id}`);
    console.log(`🏠 Đang ở trong ${c.guilds.cache.size} Servers:`);
    c.guilds.cache.forEach(g => console.log(`   • ${g.name} (ID: ${g.id})`));
    console.log(`======================================================\n`);
});

// Bẫy gói tin thô từ Discord Gateway (Bắt xem Discord có gửi tương tác về không)
client.on('raw', (packet) => {
    if (packet.t === 'INTERACTION_CREATE') {
        console.log(`📡 [RAW WEBSOCKET] Nhận gói INTERACTION_CREATE từ Gateway!`);
    }
});

// Đồng bộ Slash Commands
(async () => {
    const token = (process.env.DISCORD_TOKEN || '').trim().replace(/^["']|["']$/g, '');
    const clientId = (process.env.CLIENT_ID || '').trim().replace(/^["']|["']$/g, '');
    const guildId = (process.env.GUILD_ID || '').trim().replace(/^["']|["']$/g, '');

    if (!clientId || !token) {
        console.error('❌ [CONFIG ERROR] Thiếu DISCORD_TOKEN hoặc CLIENT_ID trong Environment!');
        return;
    }

    try {
        const rest = new REST({ timeout: 15000 }).setToken(token);
        if (guildId) {
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commandsJson }
            );
            console.log(`⚡ [DEPLOY OK] Đã ghi đè ${commandsJson.length} lệnh trực tiếp vào Server ID: ${guildId}`);
        } else {
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: commandsJson }
            );
            console.log(`🌐 [DEPLOY OK] Đã ghi đè ${commandsJson.length} lệnh toàn cục.`);
        }
    } catch (err) {
        console.error('❌ [DEPLOY ERROR] Lỗi đồng bộ Slash Commands:', err);
    }
})();

// Bắt sập tiến trình
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [FATAL UNHANDLED REJECTION]:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ [FATAL UNCAUGHT EXCEPTION]:', err);
});

const tokenToLogin = (process.env.DISCORD_TOKEN || '').trim().replace(/^["']|["']$/g, '');
client.login(tokenToLogin).catch(err => {
    console.error('❌ [DISCORD LOGIN FAILED]:', err);
});