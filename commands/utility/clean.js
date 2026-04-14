const { SlashCommandBuilder } = require('discord.js');
const { safeDeferReply, sendSuccessResponse, sendErrorResponse } = require('../../utils/responseHandler');
const config = require('../../config.js');
const { clearAllGuildCommands, clearGlobalCommands, megaCleanup } = require('../../utils/commandCleaner');
const { registerGlobalCommands, registerAllGuildCommands, clearCommandCache } = require('../../utils/commandManager');

function isOwner(userId) {
  const owners = Array.isArray(config.ownerID) ? config.ownerID : [config.ownerID];
  return owners.includes(String(userId));
}

const data = new SlashCommandBuilder()
  .setName('clean')
  .setDescription('Clear and re-register slash commands for the bot')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('slash')
      .setDescription('Clean and re-upload application slash commands')
      .addStringOption((option) =>
        option
          .setName('scope')
          .setDescription('Which commands to clean/register')
          .setRequired(false)
          .addChoices(
            { name: 'all', value: 'all' },
            { name: 'global only', value: 'global' },
            { name: 'guild only', value: 'guild' }
          )
      )
  );

module.exports = {
  data,
  run: async (client, interaction) => {
    try {
      const deferred = await safeDeferReply(interaction);
      if (!deferred && !interaction.deferred && !interaction.replied) return;

      if (!isOwner(interaction.user.id)) {
        return sendErrorResponse(
          interaction,
          '## ❌ Acceso denegado\n\nSolo el dueño del bot puede ejecutar este comando.'
        );
      }

      const scope = interaction.options.getString('scope') || 'all';

      if (scope === 'global') {
        await clearGlobalCommands(client);
        clearCommandCache();
        const registered = await registerGlobalCommands(client);
        if (!registered) {
          return sendErrorResponse(interaction, '## ❌ No se pudieron registrar los comandos globales. Verifica el token.');
        }
        return sendSuccessResponse(interaction, '## ✅ Comandos globales limpiados y reinstalados.');
      }

      if (scope === 'guild') {
        await clearAllGuildCommands(client);
        clearCommandCache();
        await registerAllGuildCommands(client);
        return sendSuccessResponse(interaction, '## ✅ Comandos de servidor limpiados y reinstalados.');
      }

      // all
      const cleanupResult = await megaCleanup(client);
      clearCommandCache();
      const globalRegistered = await registerGlobalCommands(client);
      await registerAllGuildCommands(client);

      if (!cleanupResult || !globalRegistered) {
        return sendErrorResponse(
          interaction,
          '## ❌ Error durante la limpieza o registro de comandos. Revisa los logs del bot.'
        );
      }

      return sendSuccessResponse(
        interaction,
        '## ✅ Limpieza completa ejecutada. Los comandos globales y de servidor han sido reinstalados.'
      );
    } catch (error) {
      console.error('Error in clean command:', error);
      return sendErrorResponse(
        interaction,
        `## ❌ Error al ejecutar clean\n\n${error.message || 'Ocurrió un error inesperado.'}`
      );
    }
  },
};
