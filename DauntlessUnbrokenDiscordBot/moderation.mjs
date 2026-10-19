import {MessageFlags,PermissionFlagsBits} from 'discord.js';

export async function checkBanPermission(interaction,targetId,active) {
  if(!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers))throw Error('You need Ban Members permission in this server.');
  if(targetId===interaction.user.id || targetId===interaction.client.user.id || targetId===interaction.guild.ownerId)throw Error('You cannot target yourself, the bot, or the server owner.');
  const me=await interaction.guild.members.fetchMe();
  if(!me.permissions.has(PermissionFlagsBits.BanMembers))throw Error('The bot needs Ban Members permission.');
  if(active){
    const target=await interaction.guild.members.fetch(targetId).catch(e=>{if(e.code===10007)return null;throw e;});
    const moderator=await interaction.guild.members.fetch(interaction.user.id);
    if(target && (!target.bannable || (interaction.user.id!==interaction.guild.ownerId && moderator.roles.highest.comparePositionTo(target.roles.highest)<=0)))throw Error('The target has an equal or higher role. Move the bot role above players; moderators must also outrank their targets.');
  }
}
export function moderationService(api) {
  const pending=new Map();
  function apply(guild,row) {
    const id=guild.id+':'+row.discordId;
    const task=(pending.get(id)??Promise.resolve()).catch(()=>{}).then(async()=>{
      const latest=await api.access(row.discordId);
      if(latest.moderation?.revision!==row.revision)return null;
      let error=null;
      try{
        if(row.active)await guild.members.ban(row.discordId,{reason:row.reason});
        else await guild.members.unban(row.discordId,row.reason).catch(e=>{if(e.code!==10026)throw e;});
      }catch(e){error=e.code===50013?'Discord permission or role hierarchy prevents this action.':'Discord action failed; the bot will retry.';}
      const ack=await api.acknowledgeModeration({discordId:row.discordId,guildId:guild.id,revision:row.revision,status:error?'error':'synced',error});
      if(!ack.ok)throw Error('A newer moderation change exists. Refresh its status.');
      return error;
    });
    pending.set(id,task);task.finally(()=>{if(pending.get(id)===task)pending.delete(id);}).catch(()=>{});
    return task;
  }
  let polling=false;
  return {
    async poll(client){
      if(polling||!client.isReady())return;
      polling=true;
      try{for(const guild of client.guilds.cache.values()){
        if(process.env.DISCORD_GUILD_ID && process.env.DISCORD_GUILD_ID!==guild.id)continue;
        const rows=await api.pendingModeration(guild.id);
        for(const row of rows)await apply(guild,row);
      }}finally{polling=false;}
    },
    async interaction(interaction){
      await interaction.deferReply({flags:MessageFlags.Ephemeral});
      try{
        if(process.env.DISCORD_GUILD_ID && interaction.guildId!==process.env.DISCORD_GUILD_ID)throw Error('Use this command in the configured Dauntless Unbroken server.');
        const user=interaction.options.getUser('user',true),active=interaction.commandName==='ban';
        await checkBanPermission(interaction,user.id,active);
        const result=await api.moderation({discordId:user.id,guildId:interaction.guildId,moderatorId:interaction.user.id,active,reason:interaction.options.getString('reason',true),includeIp:active && (interaction.options.getBoolean('ip')??false)});
        const error=await apply(interaction.guild,result.moderation);
        const game=result.account?'Linked game account '+(active?'banned.':'unbanned.'):'No linked game account; invite claims '+(active?'blocked.':'allowed again.');
        await interaction.editReply({content:`${game} ${error??('Discord '+(active?'ban':'unban')+' completed.')} ${active?'Account-only unless IP was explicitly selected.':''}`,allowedMentions:{parse:[]}});
      }catch(e){
        const known={address_not_observed:'No recent game IP is available. Retry without ip:true.',admin_account_protected:'Administrator game accounts are protected.',account_not_linked:'No linked game account exists for IP blocking.'};
        await interaction.editReply({content:known[e.serviceError]??(e.serviceError?'The game moderation service refused the change.':e.message==='Metagame request failed'?'The game backend is unavailable; no Discord action was attempted.':e.message),allowedMentions:{parse:[]}});
      }
    }
  };
}
