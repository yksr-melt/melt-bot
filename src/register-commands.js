const { REST, Routes } = require("discord.js");
const { clientId, discordToken, guildId } = require("./config");
const { commands } = require("./commands");

async function main() {
  const rest = new REST({ version: "10" }).setToken(discordToken);
  const body = commands.map((command) => command.data.toJSON());

  const clearGuildArg = process.argv.find((arg) => arg.startsWith("--clear-guild="));
  if (clearGuildArg) {
    const targetGuildId = clearGuildArg.split("=")[1];
    await rest.put(Routes.applicationGuildCommands(clientId, targetGuildId), { body: [] });
    console.log(`Cleared guild commands for ${targetGuildId}.`);
    return;
  }

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log(`Registered ${body.length} guild commands for ${guildId}.`);

    // GUILD_ID を使ったサーバー限定登録とグローバル登録を切り替えた際に、
    // 両方に同名コマンドが残ってDiscord上で候補が二重に出るのを防ぐため、
    // グローバル側は常にクリアしておく。
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log("Cleared global commands to avoid duplicate command candidates.");
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), { body });
  console.log(`Registered ${body.length} global commands.`);
  console.log(
    "Note: if this bot previously used a GUILD_ID for guild-scoped commands, run " +
      "`node src/register-commands.js --clear-guild=<OLD_GUILD_ID>` once to remove the leftover " +
      "guild-scoped duplicates (global registration cannot see or clear them automatically)."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
