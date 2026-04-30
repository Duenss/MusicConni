const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const { execSync } = require('child_process');

const config = require('../../config.js');
const { safeDeferReply, sendSuccessResponse, sendErrorResponse } = require('../../utils/responseHandler');
const { isMemberAllowed } = require('../../utils/accessManager');

const data = new SlashCommandBuilder()
  .setName('sync')
  .setDescription('Sincroniza los comandos slash del bot en este servidor.');

function isOwner(userId) {
  const owners = Array.isArray(config.ownerID) ? config.ownerID : [config.ownerID];
  return owners.includes(String(userId));
}

function canUseSync(userId, interaction) {
  if (isOwner(userId)) return true;

  if (interaction.member.permissions.has('Administrator')) return true;

  return isMemberAllowed(interaction.member, interaction.guildId);
}

module.exports = {
  data,

  run: async (client, interaction) => {
    try {
      const deferred = await safeDeferReply(interaction);
      if (!deferred && !interaction.deferred && !interaction.replied) return;

      if (!canUseSync(interaction.user.id, interaction)) {
        return sendErrorResponse(
          interaction,
          '## ❌ Acceso denegado\n\nSolo administradores o el owner del bot pueden usar este comando.'
        );
      }

      const commands = [];

      // Cargar comandos dinámicamente
      for (const category of fs.readdirSync('./SlashCommands')) {
        const categoryPath = `./SlashCommands/${category}`;

        if (!fs.statSync(categoryPath).isDirectory()) continue;

        const files = fs
          .readdirSync(categoryPath)
          .filter((file) => file.endsWith('.js'));

        for (const file of files) {
          try {
            const command = require(`../../SlashCommands/${category}/${file}`);

            if (command?.data) {
              commands.push(command.data.toJSON());
            }
          } catch (err) {
            console.error(`Error cargando ${category}/${file}:`, err.message);
          }
        }
      }

      if (!commands.length) {
        return sendErrorResponse(
          interaction,
          '## ❌ No se encontraron comandos\n\nVerifica la carpeta `/SlashCommands`.'
        );
      }

      await interaction.guild.commands.set(commands);

      // Obtener última actualización (git)
      let lastUpdate = 'No disponible';

      try {
        execSync('git --version', { stdio: 'ignore' });

        const commitDate = execSync('git log -1 --format=%ai', {
          encoding: 'utf-8',
        }).trim();

        if (commitDate) {
          const date = new Date(commitDate);
          lastUpdate = date.toLocaleString('es-ES');
        }
      } catch {}

      return sendSuccessResponse(
        interaction,
        `## ✅ Sincronización completada\n\n📊 Comandos: **${commands.length}**\n📅 Última actualización: **${lastUpdate}**`
      );

    } catch (error) {
      console.error('Error en sync:', error);

      return sendErrorResponse(
        interaction,
        `## ❌ Error en sincronización\n\n${error.message || 'Error desconocido'}`
      );
    }
  },
};
