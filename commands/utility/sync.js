const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionsBitField,
  EmbedBuilder,
} = require("discord.js");
const fs = require("fs");
const { execSync } = require("child_process");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sync")
    .setDescription("Sincroniza los comandos slash del bot en este servidor.")
    .setContexts(0)
    .setIntegrationTypes(0),

  async execute(interaction) {
    // Verificar si es administrador
    const isDev = interaction.user.id === "1490564957622767676";
    const isAdmin = interaction.member.permissions.has(
      PermissionsBitField.Flags.Administrator
    );

    if (!isDev && !isAdmin) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription("⚠️ Solo administradores pueden usar este comando.");

      return interaction.reply({
        embeds: [errorEmbed],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Mostrar que está procesando
    const processingEmbed = new EmbedBuilder()
      .setColor(0x3498db)
      .setDescription("⏳ Sincronizando comandos en este servidor...");

    await interaction.reply({
      embeds: [processingEmbed],
      flags: MessageFlags.Ephemeral,
    });

    try {
      const commands = [];

      // Cargar todos los comandos
      for (const category of fs.readdirSync("./SlashCommands")) {
        const categoryPath = `./SlashCommands/${category}`;
        
        if (!fs.statSync(categoryPath).isDirectory()) continue;
        
        const files = fs
          .readdirSync(categoryPath)
          .filter((file) => file.endsWith(".js"));

        for (const file of files) {
          try {
            const commandPath = `../${category}/${file}`;
            const command = require(commandPath);
            
            if (command && command.data) {
              commands.push(command.data.toJSON());
            }
          } catch (loadError) {
            console.error(`⚠️ Error al cargar ${category}/${file}:`, loadError.message);
          }
        }
      }

      if (commands.length === 0) {
        throw new Error("No se pudieron cargar comandos");
      }

      // Sincronizar en este servidor (evita duplicados con globales)
      await interaction.guild.commands.set(commands);

      // Obtener última hora de actualización solo si git está disponible
      let lastUpdate = "No disponible";
      try {
        execSync("git --version", { stdio: "ignore", cwd: process.cwd() });

        const commitDate = execSync("git log -1 --format=%ai", {
          encoding: "utf-8",
          cwd: process.cwd(),
        }).trim();

        if (commitDate) {
          const date = new Date(commitDate);
          lastUpdate = date.toLocaleString("es-ES", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
        }
      } catch (error) {
        // Git no está instalado o no se puede obtener la fecha del último commit.
      }

      const successEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ Sincronización completada")
        .setDescription(
          `📊 Comandos: ${commands.length}\n📅 Última actualización: ${lastUpdate}`
        );

      await interaction.editReply({
        embeds: [successEmbed],
      });
    } catch (error) {
      console.error("❌ Error en sincronización:", error.message);

      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("❌ Error en sincronización")
        .setDescription(error.message || "Error desconocido");

      await interaction.editReply({
        embeds: [errorEmbed],
      });
    }
  },
};
