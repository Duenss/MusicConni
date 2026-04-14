const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config.js');
const { safeDeferReply, sendSuccessResponse, sendErrorResponse } = require('../../utils/responseHandler');
const { isMemberAllowed } = require('../../utils/accessManager');

const data = new SlashCommandBuilder()
  .setName('set')
  .setDescription('Set the bot avatar or banner using a direct image URL')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('avatar')
      .setDescription('Set the bot avatar from a direct image URL')
      .addStringOption((option) =>
        option
          .setName('url')
          .setDescription('Direct image URL for the avatar')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('banner')
      .setDescription('Set the bot banner from a direct image URL')
      .addStringOption((option) =>
        option
          .setName('url')
          .setDescription('Direct image URL for the banner')
          .setRequired(true)
      )
  );

function isOwner(userId) {
  const owners = Array.isArray(config.ownerID) ? config.ownerID : [config.ownerID];
  return owners.includes(String(userId));
}

function isGuildOwner(userId, interaction) {
  return interaction.guild?.ownerId && String(interaction.guild.ownerId) === String(userId);
}

function canUseSetCommand(userId, interaction) {
  if (isOwner(userId) || isGuildOwner(userId, interaction)) {
    return true;
  }

  return isMemberAllowed(interaction.member, interaction.guildId);
}

function validateImageUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;

    const path = url.pathname.toLowerCase();
    const query = url.search.toLowerCase();
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.webm'];

    if (imageExtensions.some((ext) => path.endsWith(ext))) return true;
    if (imageExtensions.some((ext) => query.includes(`format=${ext.replace('.', '')}`))) return true;

    return false;
  } catch {
    return false;
  }
}

module.exports = {
  data,
  run: async (client, interaction) => {
    try {
      const deferred = await safeDeferReply(interaction);
      if (!deferred && !interaction.deferred && !interaction.replied) return;

      if (!canUseSetCommand(interaction.user.id, interaction)) {
        return sendErrorResponse(
          interaction,
          '## ❌ Acceso denegado\n\nSolo el dueño del servidor o el dueño del bot puede usar este comando.'
        );
      }

      const subcommand = interaction.options.getSubcommand();
      const url = interaction.options.getString('url', true).trim();

      if (!validateImageUrl(url)) {
        return sendErrorResponse(
          interaction,
          '## ❌ URL inválida\n\nPor favor ingresa una URL directa a una imagen válida (por ejemplo .png, .jpg, .webp).'
        );
      }

      if (subcommand === 'avatar') {
        await client.user.setAvatar(url);
        return sendSuccessResponse(
          interaction,
          '## ✅ Avatar actualizado\n\nEl avatar del bot ha sido cambiado correctamente.',
          null,
          5000
        );
      }

      if (subcommand === 'banner') {
        await client.user.setBanner(url);
        return sendSuccessResponse(
          interaction,
          '## ✅ Banner actualizado\n\nEl banner del bot ha sido cambiado correctamente.',
          null,
          5000
        );
      }

      return sendErrorResponse(
        interaction,
        '## ❌ Subcomando desconocido\n\nUsa `/set avatar` o `/set banner` con una URL directa de imagen.'
      );
    } catch (error) {
      console.error('Error in set command:', error);
      return sendErrorResponse(
        interaction,
        `## ❌ Error al actualizar la imagen\n\n${error.message || 'Ocurrió un error inesperado.'}`
      );
    }
  },
};
