const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildEmojisAndStickers]
});

client.on('ready', async () => {
    console.log(`\n✅ Bot conectado como ${client.user.tag}\n`);
    
    const guilds = client.guilds.cache;
    
    if (guilds.size === 0) {
        console.log('❌ El bot no está en ningún servidor');
        process.exit(1);
    }
    
    console.log(`📊 Servidores disponibles: ${guilds.size}\n`);
    
    let totalEmojis = 0;
    
    guilds.forEach((guild, index) => {
        const emojis = guild.emojis.cache;
        if (emojis.size > 0) {
            console.log(`\n🔷 SERVIDOR: ${guild.name} (${emojis.size} emojis)\n`);
            console.log('const REDWHITE_CUSTOMS = Object.freeze({');
            
            const emojiEntries = [];
            emojis.forEach(emoji => {
                emojiEntries.push({
                    name: emoji.name,
                    id: emoji.id,
                    animated: emoji.animated
                });
            });
            
            // Ordenar por nombre
            emojiEntries.sort((a, b) => a.name.localeCompare(b.name));
            
            emojiEntries.forEach((emoji) => {
                const animatedStr = emoji.animated ? ', animated: true' : '';
                console.log(`    ${emoji.name}: { name: "${emoji.name}", id: "${emoji.id}"${animatedStr} },`);
            });
            
            console.log('});\n');
            
            totalEmojis += emojis.size;
        }
    });
    
    if (totalEmojis === 0) {
        console.log('❌ No hay emojis personalizados en ninguno de los servidores del bot');
    } else {
        console.log(`\n✅ Total de emojis encontrados: ${totalEmojis}`);
        console.log('\n📝 Copia el código anterior a UI/emojis/emojiData.js\n');
    }
    
    process.exit(0);
});

client.login(config.TOKEN);
