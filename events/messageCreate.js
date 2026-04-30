const { handleMessageEvent } = require('../utils/ttsManager.js');

module.exports = async (client, message) => {
  try {
    await handleMessageEvent(client, message);
  } catch (error) {
    console.error('[EVENT messageCreate] TTS message handling failed:', error);
  }
};
