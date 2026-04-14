const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config.js');
const { safeDeferReply, sendSuccessResponse, sendErrorResponse } = require('../../utils/responseHandler');
const {
  addAllowedRole,
  removeAllowedRole,
  addAllowedMember,
  removeAllowedMember,
  listAccessSettings,
} = require('../../utils/accessManager');

const data = new SlashCommandBuilder()
  .setName('access')
  .setDescription('Manage roles and members allowed to use the bot')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('allow')
      .setDescription('Allow a role or member to use the bot')
      .addStringOption((option) =>
        option
          .setName('type')
          .setDescription('Select what to allow')
          .setRequired(true)
          .addChoices(
            { name: 'Member', value: 'member' },
            { name: 'Role', value: 'role' }
          )
      )
      .addMentionableOption((option) =>
        option
          .setName('target')
          .setDescription('Select the role or member to allow')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('deny')
      .setDescription('Remove a member or role from the allowed list')
      .addStringOption((option) =>
        option
          .setName('type')
          .setDescription('Select what to deny')
          .setRequired(true)
          .addChoices(
            { name: 'Member', value: 'member' },
            { name: 'Role', value: 'role' }
          )
      )
      .addMentionableOption((option) =>
        option
          .setName('target')
          .setDescription('Select the role or member to remove')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('list')
      .setDescription('Show roles and members allowed to use the bot')
  );

function isBotOwner(userId) {
  const owners = Array.isArray(config.ownerID) ? config.ownerID : [config.ownerID];
  return owners.includes(String(userId));
}

function isGuildOwner(userId, interaction) {
  return interaction.guild?.ownerId && String(interaction.guild.ownerId) === String(userId);
}

function canConfigureAccess(userId, interaction) {
  return isBotOwner(userId) || isGuildOwner(userId, interaction);
}

module.exports = {
  data,
  run: async (client, interaction) => {
    try {
      const deferred = await safeDeferReply(interaction);
      if (!deferred && !interaction.deferred && !interaction.replied) return;

      if (!canConfigureAccess(interaction.user.id, interaction)) {
        return sendErrorResponse(
          interaction,
          '## ❌ Acceso denegado\n\nSolo el dueño del bot o el dueño del servidor puede configurar quién puede usar el bot.'
        );
      }

      const subcommand = interaction.options.getSubcommand();
      const type = interaction.options.getString('type');
      const target = interaction.options.getMentionable('target');
      const guildId = interaction.guildId;

      if (subcommand === 'allow' || subcommand === 'deny') {
        if (!target) {
          return sendErrorResponse(
            interaction,
            '## ❌ Selecciona un objetivo válido\n\nDebes elegir un miembro o rol para esta acción.'
          );
        }

        if (type === 'member' && target.user) {
          const memberId = target.user.id;

          if (subcommand === 'allow') {
            addAllowedMember(guildId, memberId);
            return sendSuccessResponse(
              interaction,
              `## ✅ Miembro permitido\n\n<@${memberId}> ahora puede usar el bot.`
            );
          }

          removeAllowedMember(guildId, memberId);
          return sendSuccessResponse(
            interaction,
            `## ✅ Miembro removido\n\n<@${memberId}> ya no puede usar el bot.`
          );
        }

        if (type === 'role' && !target.user) {
          const roleId = target.id;

          if (subcommand === 'allow') {
            addAllowedRole(guildId, roleId);
            return sendSuccessResponse(
              interaction,
              `## ✅ Rol permitido\n\n<@&${roleId}> ahora puede usar el bot.`
            );
          }

          removeAllowedRole(guildId, roleId);
          return sendSuccessResponse(
            interaction,
            `## ✅ Rol removido\n\n<@&${roleId}> ya no puede usar el bot.`
          );
        }

        return sendErrorResponse(
          interaction,
          '## ❌ Tipo inválido\n\nSelecciona `member` o `role` y asegúrate de que el objetivo corresponda al tipo elegido.'
        );
      }

      if (subcommand === 'list') {
        const access = listAccessSettings(guildId);
        const roles = access.roles.length ? access.roles.map((id) => `<@&${id}>`).join('\n') : 'Ninguno';
        const members = access.members.length ? access.members.map((id) => `<@${id}>`).join('\n') : 'Ninguno';

        return sendSuccessResponse(
          interaction,
          `## 📋 Acceso permitido\n\n**Roles:**\n${roles}\n\n**Miembros:**\n${members}`
        );
      }

      return sendErrorResponse(
        interaction,
        '## ❌ Subcomando inválido\n\nUsa `/access allow`, `/access deny` o `/access list`.'
      );
    } catch (error) {
      console.error('Error en access command:', error);
      return sendErrorResponse(
        interaction,
        `## ❌ Error al ejecutar el comando\n\n${error.message || 'Ocurrió un error inesperado.'}`
      );
    }
  },
};
