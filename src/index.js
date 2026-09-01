require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const webApp = require('./server');

// 1. Mở Port ngay lập tức để Render giữ kết nối sống vĩnh viễn (Không bị Port Scan Timeout)
const PORT = process.env.PORT || 10000;
webApp.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [RENDER PORT] Web Server đã mở thành công tại cổng: ${PORT}`);
});

// 2. Làm sạch chuỗi biến môi trường
const rawToken = (process.env.DISCORD_TOKEN || '').trim().replace(/^["']|["']$/g, '');
const rawClientId = (process.env.CLIENT_ID || '').trim().replace(/^["']|["']$/g, '');
const rawGuildId = (process.env.GUILD_ID || '').trim().replace(/^["']|["']$/g, '');

console.log('\n--- [KIỂM TRA CẤU HÌNH MÔI TRƯỜNG] ---');
console.log(`• TOKEN Tồn Tại: ${rawToken ? 'ĐÃ CÓ (Độ dài: ' + rawToken.length + ' ký tự)' : '❌ TRỐNG'}`);
console.log(`• CLIENT_ID: ${rawClientId || '❌ TRỐNG'}`);
console.log(`• GUILD_ID: ${rawGuildId || 'Global Mode'}`);

// 3. Khởi tạo Client Discord
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

const commandFiles = getCommandFiles(path.join(__dirname, 'commands'));
for (const filePath of commandFiles) {
    try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            commandsJson.push(command.data.toJSON());
        }
    } catch (err) {
        console.error(`❌ [LỖI NẠP LỆNH] File ${filePath}:`, err.message);
    }
}
console.log(`📦 Đã nạp ${client.commands.size} lệnh vào bộ nhớ.`);

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
            console.error(`❌ [LỖI EVENT] File ${file}:`, err.message);
        }
    }
}

// BẬT TOÀN BỘ DEBUG WEBSOCKET (In chi tiết từng gói tin Gateway từ Discord)
client.on('debug', (info) => {
    // Lọc các log heartbeat để tránh spam, chỉ in log kết nối và lỗi
    if (!info.includes('Heartbeat')) {
        console.log(`🔍 [DISCORD DEBUG] ${info}`);
    }
});

client.once('ready', (c) => {
    console.log(`\n======================================================`);
    console.log(`🚀 [DISCORD READY] BOT ĐÃ ONLINE THÀNH CÔNG: ${c.user.tag}`);
    console.log(`🆔 Application ID: ${c.user.id}`);
    console.log(`🏠 Đang phục vụ tại ${c.guilds.cache.size} Server Discord`);
    console.log(`======================================================\n`);
});

// Bắt lỗi tiến trình hệ thống
process.on('unhandledRejection', (reason) => console.error('💥 [UNHANDLED REJECTION]:', reason));
process.on('uncaughtException', (err) => console.error('💥 [UNCAUGHT EXCEPTION]:', err));

// 4. Đồng bộ Slash Commands chạy ngầm (Không chặn luồng đăng nhập)
if (rawClientId && rawToken) {
    const rest = new REST({ timeout: 15000 }).setToken(rawToken);
    (async () => {
        try {
            if (rawGuildId) {
                await rest.put(
                    Routes.applicationGuildCommands(rawClientId, rawGuildId),
                    { body: commandsJson }
                );
                console.log(`⚡ [SLASH CMD] Đã nạp ${commandsJson.length} lệnh cho Guild ID: ${rawGuildId}`);
            } else {
                await rest.put(
                    Routes.applicationCommands(rawClientId),
                    { body: commandsJson }
                );
                console.log(`🌐 [SLASH CMD] Đã nạp ${commandsJson.length} lệnh toàn cục (Global).`);
            }
        } catch (err) {
            console.error('❌ [SLASH CMD ERROR] Lỗi đồng bộ lệnh:', err.message);
        }
    })();
}

// 5. Đăng nhập Discord Bot
if (rawToken) {
    console.log('📡 Đang gửi tín hiệu đăng nhập tới Discord Gateway...');
    client.login(rawToken).catch(err => {
        console.error('❌ [LOGIN FAILED] DISCORD TỪ CHỐI ĐĂNG NHẬP:', err);
    });
}