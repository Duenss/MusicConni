

module.exports = {
  TOKEN: "MTQ5OTU0MzM5MDYyMTEzOTEwNQ.GtILPA.DtznmpOdVGo3ayCJVejbYTmg9RSIq3uYI1-pTk",
  language: "en",
  ownerID: ["1490564957622767676", ""], 
  mongodbUri : "mongodb+srv://shiva:shiva@musicbotyt.ouljywv.mongodb.net/?retryWrites=true&w=majority",
  spotifyClientId : "f5abd04b2ea54a3199a81dc9421d2b3b",
  spotifyClientSecret : "a67ff53f89c2489da4fb4c52c6310748",
  setupFilePath: './commands/setup.json',
  commandsDir: './commands',  
  embedColor: "#e11d2e",
  customEmoji: false,  // true = use custom emoji IDs from emoji.js, false = use default unicode
  emojiTheme: "redwhite", // active custom emoji theme key in emoji.js
  helpBannerUrl: "https://i.ibb.co/vnN76sQ/deoo.jpg", // Optional: set a direct image URL to show an inline banner in /help
  activityName: "🗣 DiscoBot v1|@jvampaRD",  // Bot activity status message
  activityType: "PLAYING",  // Available activity types : LISTENING , PLAYING
  SupportServer: "https://discord.gg/p2X33sKxjr",
  embedTimeout: 5,
  showProgressBar: false,  // Show progress bar in track embed
  showVisualizer: false,  // Show visualizer on music card (disabled for low-memory optimization)
  generateSongCard: true,  // custom song card image, if false uses thumbnail
  metadataTag: true,  // If true, always show Song Details even when the card image is present
  lowMemoryMode: true,   // Performance optimizations for low-memory environments (512MB RAM)
  errorLog: "", 
  nodes: [
  {
  name: "GlaceYT",
  password: "glace",
  host: "de-01.strixnodes.com",
  port: 2010,
  secure: false
}
  ]
}

