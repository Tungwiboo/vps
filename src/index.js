require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const webApp = require('./server');

const PORT = process.env.PORT || 10000;
const rawToken = (process.env.DISCORD_TOKEN || '').trim().replace(/^["']|["']$/g, '');
const rawClientId = (process.env.CLIENT_ID || '').trim().replace(/^["']|["']$/g, '');
const rawGuildId = (process.env.GUILD_ID || '').trim().replace(/^["']|["']$/g, '');

// 1. Kiểm tra biến môi trường bắt buộc
console.log('--- [BƯỚC 1: KIỂM TRA BIẾN MÔI TRƯỜNG] ---');
if (!rawToken) {
    console.error('❌ FATAL ERROR: Thiếu DISCORD_TOKEN trong biến môi trường!');
    process.exit(1);
}
if (!rawClientId) {
    console.error('❌ FATAL ERROR: Thiếu CLIENT_ID trong biến môi trường!');
    process.exit(1);
}
console.log('✅ Biến môi trường hợp lệ.');

// 2. Khởi tạo Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

client.commands = new Collection();
const commandsJson = [];

// Quét thư mục commands đệ quy
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

// 3. Nạp Commands & Bắt lỗi file hỏng
console.log('\n--- [BƯỚC 2: NẠP COMMANDS & EVENTS] ---');
const commandFiles = getCommandFiles(path.join(__dirname, 'commands'));
for (const filePath of commandFiles) {
    try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            commandsJson.push(command.data.toJSON());
            console.log(` ✅ Nạp lệnh: /${command.data.name}`);
        } else {
            console.error(` ⚠️ File thiếu structure data/execute: ${filePath}`);
        }
    } catch (err) {
        console.error(` ❌ LỖI CRASH FILE LỆNH [${filePath}]:\n`, err);
        process.exit(1);
    }
}

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
            console.log(` ✅ Nạp Event: ${event.name}`);
        } catch (err) {
            console.error(` ❌ LỖI CRASH FILE EVENT [${file}]:\n`, err);
            process.exit(1);
        }
    }
}

// 4. Bắt lỗi sập tiến trình hệ thống
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 [UNHANDLED REJECTION]:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('💥 [UNCAUGHT EXCEPTION]:', err);
    process.exit(1);
});

// 5. Khởi chạy Bot -> Kết nối thành công mới mở Port Web Server
(async () => {
    console.log('\n--- [BƯỚC 3: ĐỒNG BỘ SLASH COMMANDS LÊN DISCORD API] ---');
    try {
        const rest = new REST({ timeout: 15000 }).setToken(rawToken);
        if (rawGuildId) {
            await rest.put(
                Routes.applicationGuildCommands(rawClientId, rawGuildId),
                { body: commandsJson }
            );
            console.log(`✅ Đồng bộ thành công ${commandsJson.length} lệnh vào Server Guild ID: ${rawGuildId}`);
        } else {
            await rest.put(
                Routes.applicationCommands(rawClientId),
                { body: commandsJson }
            );
            console.log(`✅ Đồng bộ thành công ${commandsJson.length} lệnh Global.`);
        }
    } catch (err) {
        console.error('❌ LỖI REST API ĐỒNG BỘ SLASH COMMANDS:\n', err);
        process.exit(1);
    }

    console.log('\n--- [BƯỚC 4: ĐĂNG NHẬP DISCORD GATEWAY] ---');
    try {
        await client.login(rawToken);
    } catch (err) {
        console.error('❌ LỖI ĐĂNG NHẬP TOKEN DISCORD:\n', err);
        process.exit(1);
    }
})();

// Khi Bot đã sẵn sàng nhận lệnh từ Gateway -> Mở Port cho Render
client.once('ready', (c) => {
    console.log(`\n======================================================`);
    console.log(`🚀 [DISCORD READY] Bot đã kết nối: ${c.user.tag}`);
    console.log(`🆔 Application ID: ${c.user.id}`);
    console.log(`🏠 Số lượng Server: ${c.guilds.cache.size}`);
    console.log(`======================================================\n`);

    console.log('--- [BƯỚC 5: MỞ PORT WEB SERVER CHO RENDER] ---');
    webApp.listen(PORT, '0.0.0.0', () => {
        console.log(`🌐 Web Server đã mở tại cổng: ${PORT}`);
        console.log(`🎉 TOÀN BỘ HỆ THỐNG ĐÃ HOẠT ĐỘNG HOÀN HẢO!`);
    });
});