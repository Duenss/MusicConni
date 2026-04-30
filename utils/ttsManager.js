const { getLavalinkManager } = require('../lavalink.js');
const { getLang } = require('./languageLoader.js');

const ttsStates = new Map();

function normalizeVoiceLocale(code) {
  if (!code || typeof code !== 'string') return 'en';
  const normalized = code.toLowerCase();
  if (normalized.startsWith('es')) return 'es';
  if (normalized.startsWith('fr')) return 'fr';
  if (normalized.startsWith('de')) return 'de';
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('ko')) return 'ko';
  if (normalized.startsWith('ru')) return 'ru';
  if (normalized.startsWith('pt')) return 'pt';
  if (normalized.startsWith('it')) return 'it';
  return 'en';
}

function truncateText(text, maxLength = 180) {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, maxLength - 3)}...`;
}

function buildTtsUrl(text, locale = 'en') {
  const query = encodeURIComponent(truncateText(text));
  return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${locale}&q=${query}`;
}

async function waitForPlayerConnection(player, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (player?.connected) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

async function ensureVoiceConnection(client, guildId, voiceChannelId, textChannelId) {
  const existingPlayer = client.riffy.players.get(guildId);
  const nodeManager = getLavalinkManager();
  if (!nodeManager) {
    throw new Error('No Lavalink node manager available.');
  }

  await nodeManager.ensureNodeAvailable();

  if (existingPlayer) {
    if (existingPlayer.voiceChannel && existingPlayer.voiceChannel !== voiceChannelId) {
      throw new Error('The bot is already connected to a different voice channel.');
    }
    return existingPlayer;
  }

  const player = client.riffy.createConnection({
    guildId,
    voiceChannel: voiceChannelId,
    textChannel: textChannelId,
    deaf: true
  });

  const connected = await waitForPlayerConnection(player, 15000);
  if (!connected) {
    throw new Error('Failed to establish a voice connection.');
  }

  return player;
}

async function enqueueTtsTrack(client, guildId, text, requester) {
  const state = ttsStates.get(guildId);
  if (!state || !state.active) return false;
  const trackUrl = buildTtsUrl(text, state.locale);

  let player = client.riffy.players.get(guildId);
  if (!player || player.voiceChannel !== state.voiceChannelId) {
    player = await ensureVoiceConnection(client, guildId, state.voiceChannelId, state.textChannelId);
  }

  const resolve = await client.riffy.resolve({ query: trackUrl, requester });
  if (!resolve || !resolve.tracks || !resolve.tracks.length) {
    throw new Error('Failed to resolve TTS audio.');
  }

  const track = resolve.tracks[0];
  track.info.requester = requester;
  player.queue.add(track);

  if (!player.playing && !player.paused && player.queue.length > 0) {
    player.play();
  }

  return true;
}

async function startTtsForGuild(client, interaction, textChannel) {
  const userVoiceChannel = interaction.member.voice.channel;
  if (!userVoiceChannel) {
    throw new Error('You need to be in a voice channel.');
  }

  const lang = await getLang(interaction.guildId);
  const locale = normalizeVoiceLocale(lang?.meta?.code);

  const state = {
    active: true,
    voiceChannelId: userVoiceChannel.id,
    textChannelId: textChannel.id,
    locale,
    startedBy: interaction.user.id,
    createdAt: Date.now()
  };

  ttsStates.set(interaction.guildId, state);

  const player = await ensureVoiceConnection(client, interaction.guildId, state.voiceChannelId, state.textChannelId);
  if (player && !player.playing && !player.paused && player.queue.length > 0) {
    player.play();
  }

  return state;
}

function stopTtsForGuild(guildId) {
  if (!ttsStates.has(guildId)) return false;
  ttsStates.delete(guildId);
  return true;
}

async function handleMessageEvent(client, message) {
  if (!message.guild || message.author?.bot) return;

  const state = ttsStates.get(message.guild.id);
  if (!state || !state.active) return;
  if (message.channelId !== state.textChannelId) return;
  if (!message.content && !message.attachments?.size) return;

  const authorName = message.member?.displayName || message.author.username;
  const content = (message.cleanContent || message.content || '').trim();
  if (!content || content.startsWith('/') || content.startsWith('!')) return;

  const attachmentText = message.attachments?.size
    ? ` Attachment${message.attachments.size > 1 ? 's' : ''}: ${message.attachments.map((a) => a.name || 'file').join(', ')}.`
    : '';

  const ttsText = `${authorName} says: ${content}${attachmentText}`;
  const safeText = truncateText(ttsText, 170);

  try {
    await enqueueTtsTrack(client, message.guild.id, safeText, authorName);
  } catch (error) {
    console.error(`[TTS] Failed to enqueue message in guild ${message.guild.id}:`, error.message);
  }
}

module.exports = {
  startTtsForGuild,
  stopTtsForGuild,
  handleMessageEvent,
  isTtsActive: (guildId) => ttsStates.has(guildId),
  getTtsState: (guildId) => ttsStates.get(guildId)
};
