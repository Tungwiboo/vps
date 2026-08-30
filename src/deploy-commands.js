require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const foldersPath = path.join(__dirname, 'commands');

// Hàm quét toàn bộ file .js trong thư mục commands và các thư mục con
function getCommandFiles(dir) {
    let files = [];
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

const commandFiles = getCommandFiles(foldersPath);

for (const filePath of commandFiles) {
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`🧹 Đang đồng bộ và làm mới ${commands.length} lệnh Slash Commands...`);

        // Nếu có khai báo GUILD_ID -> Đăng ký và làm mới ngay lập tức cho Server
        if (process.env.GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands }
            );
            console.log('✅ Đã xóa lệnh cũ và cập nhật lệnh mới cho Server!');
        } else {
            // Đăng ký toàn cục (Global) nếu không có GUILD_ID
            await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands }
            );
            console.log('✅ Đã xóa lệnh cũ và cập nhật lệnh mới toàn cục (Global)!');
        }
    } catch (error) {
        console.error('❌ Lỗi khi cập nhật Slash Commands:', error);
    }
})();