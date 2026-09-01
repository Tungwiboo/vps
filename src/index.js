require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const webApp = require('./server');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

client.commands = new Collection();

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
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

// Nạp các sự kiện trong thư mục events
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

webApp.get('/', (req, res) => {
    res.status(200).send('🤖 Bot Discord is Online 24/7!');
});

const PORT = process.env.PORT || 7860;
webApp.listen(PORT, () => {
    console.log(`🌐 Web Server đang chạy tại cổng: ${PORT}`);
});

// Chống sập tiến trình khi gặp timeout hoặc mất kết nối tạm thời
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ [Anti-Crash] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ [Anti-Crash] Uncaught Exception:', err);
});

client.login(process.env.DISCORD_TOKEN);