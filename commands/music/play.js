const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../../config.js');
const SpotifyWebApi = require('spotify-web-api-node');
const { getData } = require('spotify-url-info')(require('node-fetch'));
const { sendErrorResponse, handleCommandError, safeDeferReply, buildPaleCard, sanitizeTitle, stripLeadingIcons } = require('../../utils/responseHandler.js');
const { checkVoiceChannel: checkVC } = require('../../utils/voiceChannelCheck.js');
const { getLavalinkManager } = require('../../lavalink.js');
const { getLang } = require('../../utils/languageLoader');
const { getEmoji } = require('../../UI/emojis/emoji');
const requesters = new Map();

const data = new SlashCommandBuilder()
  .setName("play")
  .setDescription("Play a song from a name or link")
  .addStringOption(option =>
    option.setName("name")
      .setDescription("Enter song name / link or playlist")
      .setRequired(true)
  );

const spotifyApi = new SpotifyWebApi({
    clientId: config.spotifyClientId, 
    clientSecret: config.spotifyClientSecret,
});

// Validate Spotify credentials on startup
if (!config.spotifyClientId || !config.spotifyClientSecret) {
    console.warn('[SPOTIFY] ⚠️ WARNING: Spotify credentials are missing in config.js - playlist features will not work');
}

let spotifyAccessToken = null;
let spotifyTokenExpiresAt = 0;

async function getSpotifyAccessToken(forceRefresh = false) {
    const now = Date.now();
    
    // Return cached token if still valid (refresh 1 min before expiry)
    if (!forceRefresh && spotifyAccessToken && spotifyTokenExpiresAt > now + 60000) {
        return spotifyAccessToken;
    }

    try {
        const response = await spotifyApi.clientCredentialsGrant();
        
        if (!response.body || !response.body.access_token) {
            throw new Error('No access token in response');
        }

        spotifyAccessToken = response.body.access_token;
        spotifyTokenExpiresAt = now + (response.body.expires_in * 1000);
        
        console.log('[SPOTIFY] ✅ Successfully obtained access token');
        return spotifyAccessToken;
    } catch (error) {
        console.error('[SPOTIFY] ❌ Failed to get access token:', {
            status: error.statusCode || error.status,
            message: error.message,
            body: error.body || 'N/A'
        });
        throw error;
    }
}

async function waitForPlayerConnection(player, timeoutMs = 15000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (player?.connected) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
}

async function getSpotifyPlaylistTracks(playlistId, retryCount = 0) {
    const maxRetries = 2;
    
    try {
        if (!playlistId || playlistId.trim() === '') {
            throw new Error('Invalid playlist ID: empty or null');
        }

        // Get access token with refresh logic
        const accessToken = await getSpotifyAccessToken();
        spotifyApi.setAccessToken(accessToken);

        console.log(`[SPOTIFY] Fetching playlist: ${playlistId}`);

        let tracks = [];
        let offset = 0;
        let limit = 100;
        let total = 0;
        let attempts = 0;
        const maxAttempts = 50; // Prevent infinite loops

        do {
            if (attempts >= maxAttempts) {
                console.warn(`[SPOTIFY] Maximum pagination attempts (${maxAttempts}) reached. Stopping.`);
                break;
            }

            try {
                const response = await spotifyApi.getPlaylistTracks(playlistId, { limit, offset });
                
                if (!response.body || !response.body.items) {
                    throw new Error('Invalid response structure from Spotify API');
                }

                total = response.body.total;
                offset += limit;

                for (const item of response.body.items) {
                    if (item.track && item.track.name && item.track.artists) {
                        const trackName = `${item.track.name} - ${item.track.artists.map(a => a.name).join(', ')}`;
                        tracks.push(trackName);
                    }
                }
                
                attempts++;
                
            } catch (paginationError) {
                console.error(`[SPOTIFY] Error during pagination at offset ${offset}:`, {
                    status: paginationError.statusCode || paginationError.status,
                    message: paginationError.message
                });
                break;
            }

        } while (tracks.length < total);

        console.log(`[SPOTIFY] ✅ Successfully fetched ${tracks.length} tracks from playlist`);
        return tracks;

    } catch (error) {
        console.error('[SPOTIFY] ❌ Error fetching Spotify playlist tracks:', {
            playlistId,
            status: error.statusCode || error.status,
            message: error.message,
            errorBody: error.body || 'N/A',
            retryCount
        });

        // Retry logic for temporary failures
        if (retryCount < maxRetries && 
            (error.statusCode === 429 || error.statusCode === 503 || error.message.includes('timeout'))) {
            const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
            console.log(`[SPOTIFY] Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return getSpotifyPlaylistTracks(playlistId, retryCount + 1);
        }

        return [];
    }
}

module.exports = {
    data: data,
    run: async (client, interaction) => {
        try {
            const lang = await getLang(interaction.guildId);
            const t = lang.music.play;

            const query = interaction.options.getString('name');

            const deferred = await safeDeferReply(interaction);

            if (!deferred && !interaction.deferred && !interaction.replied) return;
            const existingPlayer = client.riffy.players.get(interaction.guildId);
            const voiceCheck = await checkVC(interaction, existingPlayer);
            if (!voiceCheck.allowed) {
                const reply = await interaction.editReply(voiceCheck.response);
                setTimeout(() => reply.delete().catch(() => {}), 5000);
                return reply;
            }

            const nodeManager = getLavalinkManager();
            if (!nodeManager) {
                return sendErrorResponse(
                    interaction,
                    t.lavalinkManagerError.title + '\n\n' +
                    t.lavalinkManagerError.message + '\n' +
                    t.lavalinkManagerError.note,
                    5000
                );
            }
            
            try {
                await nodeManager.ensureNodeAvailable();
            } catch (error) {
                const nodeCount = nodeManager.getNodeCount();
                const totalCount = nodeManager.getTotalNodeCount();
                return sendErrorResponse(
                    interaction,
                    t.noNodes.title + '\n\n' +
                    t.noNodes.message
                        .replace('{connected}', nodeCount)
                        .replace('{total}', totalCount) + '\n' +
                    t.noNodes.note,
                    5000
                );
            }

            const userVoiceChannel = interaction.member.voice.channelId;
            
            if (existingPlayer && existingPlayer.voiceChannel !== userVoiceChannel) {
                try {
                    const { cleanupTrackMessages } = require('../../player.js');
                    await cleanupTrackMessages(client, existingPlayer);
                    existingPlayer.queue.clear();
                    existingPlayer.stop();
                    await new Promise(resolve => setTimeout(resolve, 300));
                    existingPlayer.destroy();
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    console.error('Error destroying old player:', error);
                    try {
                        if (!existingPlayer.destroyed) {
                            existingPlayer.destroy();
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    } catch (e) {}
                }
            }

            await nodeManager.checkAllNodesHealth().catch(() => {});
            await nodeManager.forceConnectAllNodes().catch(() => {});
            await new Promise(res => setTimeout(res, 400));
            
            let player;
            let attempts = 0;
            const maxAttempts = 3;
            
            while (attempts < maxAttempts) {
                await nodeManager.ensureNodeAvailable();
                try {
                    player = client.riffy.createConnection({
                        guildId: interaction.guildId,
                        voiceChannel: userVoiceChannel,
                        textChannel: interaction.channelId,
                        deaf: true
                    });
                    
                    // Validate player was created
                    if (!player) {
                        throw new Error('Player creation returned null or undefined');
                    }
                    
                    break;
                } catch (err) {
                    attempts++;
                    const msg = err?.message || '';
                    if (attempts < maxAttempts && (msg.includes('No nodes are available') || msg.includes('fetch failed'))) {
                        await nodeManager.reconnectNodesNow?.(5000).catch(() => {});
                        await nodeManager.ensureNodeAvailable();
                        await new Promise(res => setTimeout(res, 700));
                        continue;
                    }
                    if (attempts >= maxAttempts) {
                        await nodeManager.refreshRiffy?.();
                        await nodeManager.ensureNodeAvailable();
                        player = client.riffy.createConnection({
                            guildId: interaction.guildId,
                            voiceChannel: userVoiceChannel,
                            textChannel: interaction.channelId,
                            deaf: true
                        });
                        break;
                    }
                    throw err;
                }
            }

            let tracksToQueue = [];
            let isPlaylist = false;

            if (query.includes('spotify.com')) {
                try {
                    const spotifyData = await getData(query);

                    if (spotifyData.type === 'track') {
                        const trackName = `${spotifyData.name} - ${spotifyData.artists.map(a => a.name).join(', ')}`;
                        tracksToQueue.push(trackName);
                    } else if (spotifyData.type === 'playlist') {
                        isPlaylist = true;
                        const playlistId = query.split('/playlist/')[1].split('?')[0]; 
                        tracksToQueue = await getSpotifyPlaylistTracks(playlistId);
                    }
                } catch (err) {
                    console.error('Error fetching Spotify data:', err);
                    return sendErrorResponse(
                        interaction,
                        t.spotifyError.title + '\n\n' +
                        t.spotifyError.message + '\n' +
                        t.spotifyError.note,
                        5000
                    );
                }
            } else {
                let resolve;
                try {
                    resolve = await client.riffy.resolve({ query, requester: interaction.user.username });
                } catch (err) {
                    const msg = err?.message || '';
                    if (msg.includes('fetch failed') || msg.includes('No nodes are available') || (err.cause && err.cause.code === 'ECONNREFUSED')) {
                        await nodeManager.reconnectNodesNow?.(5000).catch(() => {});
                        await nodeManager.ensureNodeAvailable();
                        resolve = await client.riffy.resolve({ query, requester: interaction.user.username });
                    } else {
                        throw err;
                    }
                }

                if (!resolve || typeof resolve !== 'object' || !Array.isArray(resolve.tracks)) {
                    return sendErrorResponse(
                        interaction,
                        t.invalidResponse.title + '\n\n' +
                        t.invalidResponse.message + '\n' +
                        t.invalidResponse.note,
                        5000
                    );
                }

                if (resolve.loadType === 'playlist') {
                    isPlaylist = true;
                    for (const track of resolve.tracks) {
                        track.info.requester = interaction.user.username;
                        player.queue.add(track);
                        requesters.set(track.info.uri, interaction.user.username);
                    }
                } else if (resolve.loadType === 'search' || resolve.loadType === 'track') {
                    const track = resolve.tracks.shift();
                    track.info.requester = interaction.user.username;
                    player.queue.add(track);
                    requesters.set(track.info.uri, interaction.user.username);
                } else {
                    return sendErrorResponse(
                        interaction,
                        t.noResults.title + '\n\n' +
                        t.noResults.message + '\n' +
                        t.noResults.note,
                        5000
                    );
                }
            }

            let queuedTracks = 0;

            const maxTracks = 200;
            for (let i = 0; i < Math.min(tracksToQueue.length, maxTracks); i++) {
                const trackQuery = tracksToQueue[i];
                try {
                    const resolve = await client.riffy.resolve({ query: trackQuery, requester: interaction.user.username });
                    if (resolve && resolve.tracks && resolve.tracks.length > 0) {
                        const trackInfo = resolve.tracks[0];
                        player.queue.add(trackInfo);
                        requesters.set(trackInfo.info.uri, interaction.user.username);
                        queuedTracks++;
                    }
                } catch (error) {
                    console.error(`Error resolving track ${trackQuery}:`, error);
                }
            }
            
            if (tracksToQueue.length > maxTracks) {
                console.warn(`Playlist truncated: ${tracksToQueue.length} tracks requested, only ${maxTracks} queued`);
            }

            // Aumentar espera para conexión de voz y agregar reintentos
            let connected = await waitForPlayerConnection(player, 15000);
            
            if (!connected) {
                // Reintentar una vez más con pequeño delay
                await new Promise(res => setTimeout(res, 1000));
                connected = await waitForPlayerConnection(player, 8000);
            }
            
            if (!connected) {
                console.error(`[PLAY] Connection failed for guild ${interaction.guildId}, player connected=${player?.connected}`);
                throw new Error('Voice connection was not established. The bot did not join the voice channel.');
            }

            // Esperar brevemente y luego reproducir
            await new Promise(res => setTimeout(res, 300));
            
            if (!player.playing && !player.paused && player.queue.length > 0) {
                try {
                    player.play();
                } catch (playError) {
                    const msg = playError?.message || '';
                    if (msg.includes('Player connection is not initiated')) {
                        console.error(`[PLAY] Player connection not initiated after successful connection check for guild ${interaction.guildId}`);
                        // Esperar más y reintentar
                        await new Promise(res => setTimeout(res, 1500));
                        if (player.queue.length > 0 && !player.destroyed) {
                            try {
                                player.play();
                            } catch (retryError) {
                                throw new Error(`Failed to start playback: ${retryError?.message || 'Unknown error'}`);
                            }
                        }
                    } else {
                        throw playError;
                    }
                }
            }

            const successTitle = isPlaylist ? t.success.titlePlaylist : t.success.titleTrack;
            const titleIcon = isPlaylist ? (getEmoji('playlist') || '📚') : (getEmoji('music') || '🎵');
            const addedIcon = isPlaylist ? (getEmoji('playlist') || '📚') : (getEmoji('success') || '✅');
            const statusIcon = player.playing ? (getEmoji('play') || '▶️') : (getEmoji('pause') || '⏸️');
            const statusText = stripLeadingIcons(player.playing ? t.success.nowPlaying : t.success.queueReady);
            const successContainer = buildPaleCard(
                `${titleIcon} ${sanitizeTitle(successTitle, 'Play')}`,
                [
                    `### ${addedIcon} Added` + '\n' +
                    (isPlaylist
                        ? t.success.playlistAdded.replace('{count}', queuedTracks)
                        : t.success.trackAdded),
                    `### ${statusIcon} Status` + '\n' +
                    statusText
                ]
            );

            const message = await interaction.editReply({ 
                components: [successContainer],
                flags: MessageFlags.IsComponentsV2,
                fetchReply: true
            });

            setTimeout(() => {
                message.delete().catch(() => {}); 
            }, 3000);

        } catch (error) {
            const lang = await getLang(interaction.guildId).catch(() => ({ music: { play: { errors: {} } } }));
            const t = lang.music?.play?.errors || {};
            
            return handleCommandError(
                interaction,
                error,
                'play',
                (t.title || '## ❌ Error') + '\n\n' + (t.message || 'An error occurred while processing the request.\nPlease try again later.')
            );
        }
    },
    requesters: requesters,
};
