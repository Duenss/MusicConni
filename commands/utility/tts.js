const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { safeDeferReply, sendSuccessResponse, sendErrorResponse } = require('../../utils/responseHandler.js');
const { checkVoiceChannel } = require('../../utils/voiceChannelCheck.js');
const { startTtsForGuild, stopTtsForGuild, isTtsActive, getTtsState } = require('../../utils/ttsManager.js');

const data = new SlashCommandBuilder()
  .setName('tts')
  .setDescription('Start or stop voice TTS reading from a text channel')
  .addSubcommand((sub) =>
    sub
      .setName('start')
      .setDescription('Join your voice channel and read messages from a text channel')
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Text channel to read from')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('stop')
      .setDescription('Stop reading messages and disable TTS mode')
  );

module.exports = {
  data,
  run: async (client, interaction) => {
    const deferred = await safeDeferReply(interaction);
    if (!deferred && !interaction.deferred && !interaction.replied) return;

    const subcommand = interaction.options.getSubcommand();
    const lang = await require('../../utils/languageLoader').getLang(interaction.guildId);
    const success = lang.utility?.tts?.success || {
      start: '✅ TTS activated. I am now reading messages from {channel}.',
      stop: '⏹️ TTS has been stopped.',
      alreadyActive: '⚠️ TTS is already active for {channel}.',
      notActive: '⚠️ TTS is not currently active.'
    };

    try {
      if (subcommand === 'start') {
        const textChannel = interaction.options.getChannel('channel');
        if (!textChannel || textChannel.type !== ChannelType.GuildText) {
          return sendErrorResponse(interaction, '❌ Por favor selecciona un canal de texto válido.');
        }

        const existingPlayer = client.riffy.players.get(interaction.guildId);
        const voiceCheck = await checkVoiceChannel(interaction, existingPlayer);
        if (!voiceCheck.allowed) {
          return sendErrorResponse(interaction, voiceCheck.response);
        }

        const currentState = getTtsState(interaction.guildId);
        if (currentState?.active && currentState.textChannelId === textChannel.id) {
          return sendErrorResponse(interaction, success.alreadyActive.replace('{channel}', `<#${textChannel.id}>`));
        }

        await startTtsForGuild(client, interaction, textChannel);
        return sendSuccessResponse(interaction, success.start.replace('{channel}', `<#${textChannel.id}>`));
      }

      if (subcommand === 'stop') {
        const stopped = stopTtsForGuild(interaction.guildId);
        if (!stopped) {
          return sendErrorResponse(interaction, success.notActive);
        }
        return sendSuccessResponse(interaction, success.stop);
      }

      return sendErrorResponse(interaction, '❌ Subcommand not recognized.');
    } catch (error) {
      console.error('[COMMAND tts] Error:', error);
      return sendErrorResponse(interaction, `❌ Error: ${error.message}`);
    }
  }
};
