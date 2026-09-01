const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`🚀 [GATEWAY OK] Bot đã online thành công: ${client.user.tag}`);
    },
};