import { PermissionFlagsBits, Routes, SlashCommandBuilder } from 'discord.js';

export const keyCommand = new SlashCommandBuilder().setName('key').setDescription('Your Dauntless Unbroken access code')
  .setContexts(0, 1)
  .addSubcommand(option => option.setName('resend').setDescription('Resend your saved unused invite privately; never creates another'))
  .addSubcommand(option => option.setName('recover').setDescription('Privately rotate your verified linked account key').addStringOption(value=>value.setName('confirm').setDescription('Your private five-minute recovery challenge').setMinLength(64).setMaxLength(64)))
  .addSubcommand(option => option.setName('claim').setDescription('Receive your launcher invite by direct message'))
  .addSubcommand(option => option.setName('status').setDescription('Check your account link or code redemption'))
  .addSubcommand(option => option.setName('link').setDescription('Link your existing account using its saved account key, not a Join invite')
    .addStringOption(value => value.setName('key').setDescription('Settings > Save a backup of your key > copy the Key: value (not your Join invite)').setRequired(true).setMinLength(8).setMaxLength(2048)))
  .toJSON();

// Do not advertise rotation until its separately authenticated backend is configured.
if (!process.env.KEY_RECOVERY_SERVICE_SECRET) {
  keyCommand.options = keyCommand.options.filter(option => option.name !== 'recover');
}

function optionShape(option) {
  return {type:option.type, name:option.name, description:option.description,
    required:option.required ?? false, min_length:option.min_length ?? null, max_length:option.max_length ?? null,
    options:(option.options ?? []).map(optionShape)};
}
function shape(command, guild) {
  return {...optionShape(command), type:command.type ?? 1,
    default_member_permissions:command.default_member_permissions??null,
    contexts:guild ? [] : [...(command.contexts ?? [])].sort()};
}

// Preserve command IDs and other commands. Avoid POST on every restart: clients cache versions.
export async function syncKeyCommands(rest, applicationId, guildIds = []) {
  const route = Routes.applicationCommands(applicationId);
  const existing = (await rest.get(route)).find(command=>command.name==='key' && command.type===1);
  let changed = 0;
  if (!existing || JSON.stringify(shape(existing,false))!==JSON.stringify(shape(keyCommand,false))) {
    if (existing) await rest.patch(`${route}/${existing.id}`,{body:keyCommand});
    else await rest.post(route,{body:keyCommand});
    changed++;
  }
  // Guild registration is immediately available; the global copy also supports DMs.
  for (const id of new Set(guildIds)) {
    const guildRoute=Routes.applicationGuildCommands(applicationId,id);
    const commands=await rest.get(guildRoute);
    for(const desired of [keyCommand,...moderationCommands]) {
      const {contexts,...body}=desired;
      const command=commands.find(c=>c.name===desired.name && c.type===1);
      if(!command||JSON.stringify(shape(command,true))!==JSON.stringify(shape(body,true))){
        if(command)await rest.patch(`${guildRoute}/${command.id}`,{body});
        else await rest.post(guildRoute,{body});
        changed++;
      }
    }
  }
  return changed;
}

export const moderationCommands=['ban','unban'].map(name=>new SlashCommandBuilder().setName(name)
  .setDescription(name==='ban'?'Ban a Discord member and their linked game account':'Unban a Discord member and their linked game account')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption(option=>option.setName('user').setDescription('Discord account to moderate').setRequired(true))
  .addStringOption(option=>option.setName('reason').setDescription('Reason shown in the launcher and dashboard').setRequired(true).setMaxLength(500))
  .addBooleanOption(option=>option.setName('ip').setDescription('Also block the recently observed game IP; default is account only'))
  .toJSON());
