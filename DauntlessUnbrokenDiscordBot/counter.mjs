import {ChannelType, PermissionFlagsBits, SlashCommandBuilder, MessageFlags, Routes} from 'discord.js';
import {readFile} from 'node:fs/promises';
import {saveState} from './keys.mjs';

export const COUNTER_OWNER='1121938502947459152';
export const COUNTER_CATEGORY='───📊 Discord Statistics 📊───';
export function counterNames(counts,presences) {
  return {Bots:'»»—Dauntless Unbroken—««',
    Users:presences?`🟢${presences.online}  ⛔${presences.dnd}  🌙${presences.idle}`:'🟢—  ⛔—  🌙—',
    Total:`🌐${counts.Total}  👤${counts.Users}  🤖${counts.Bots}`};
}
export function presenceCounts(members) {
  const counts={online:0,dnd:0,idle:0};
  for(const member of members.values()) if(!member.user.bot && Object.hasOwn(counts,member.presence?.status)) counts[member.presence.status]++;
  return counts;
}
export const counterCommand=new SlashCommandBuilder().setName('counter').setDescription('Configure the live member counter (owner only)')
  .setContexts(0).addStringOption(o=>o.setName('category_id').setDescription('Discord category ID').setRequired(true)).toJSON();
export async function syncCounterCommand(rest,appId,guildIds=[]) {
  for(const route of [Routes.applicationCommands(appId),...[...new Set(guildIds)].map(id=>Routes.applicationGuildCommands(appId,id))]){
  const old=(await rest.get(route)).find(c=>c.name==='counter' && c.type===1);
  const {contexts,...guildCommand}=counterCommand;
  const body=route.includes('/guilds/')?guildCommand:counterCommand;
  if (!old) await rest.post(route,{body});
  else if (old.description!==counterCommand.description || old.options?.[0]?.name!=='category_id') await rest.patch(`${route}/${old.id}`,{body});
  }
}
export async function loadCounters(file) {
  try {
    const state=JSON.parse(await readFile(file,'utf8'));
    if (state.version!==1 || !state.guilds || typeof state.guilds!=='object' || Array.isArray(state.guilds)) throw new Error('Invalid counter state');
    return state;
  } catch(error) { if(error.code==='ENOENT') return {version:1,guilds:{}}; throw error; }
}
export function memberCounts(members) {
  let bots=0,users=0;
  for(const member of members.values()) member.user.bot ? bots++ : users++;
  return {Bots:bots,Users:users,Total:bots+users};
}
export class Counters {
  queue=Promise.resolve(); timers=new Map(); loaded=new Set();
  constructor(client,state,save,presences=false) {Object.assign(this,{client,state,save,presences});}
  serialize(fn) {const task=this.queue.catch(()=>{}).then(fn);this.queue=task;return task;}
  async configure(interaction) {
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    if(interaction.user.id!==COUNTER_OWNER) return interaction.editReply('Only the server owner can configure counters.');
    if(!interaction.guild) return interaction.editReply('Run this command in the Discord server.');
    try {
      const id=interaction.options.getString('category_id',true);
      if(!/^\d{17,20}$/.test(id)) throw new Error('Enter a valid category ID.');
      await this.serialize(async()=>{
        const guild=interaction.guild;
        const category=await guild.channels.fetch(id);
        await this.validate(guild,category);
        const previous=this.state.guilds[guild.id];
        if(previous && previous.categoryId!==id) throw new Error('A counter category is already configured. Reuse it to avoid duplicate counters.');
        this.state.guilds[guild.id] ??= {categoryId:id,channels:{}};
        await this.save(this.state);
        await this.refresh(guild);
      });
      await interaction.editReply('📊 Dauntless Unbroken statistics configured. Member counts update automatically.'+(this.presences?' Online, busy and idle counts are enabled.':' Enable Presence Intent in Discord Developer Portal for online/busy/idle counts.'));
    } catch(error) {await interaction.editReply(error.message?.startsWith('Enter ') || error.message?.startsWith('A counter') || error.message?.startsWith('The category') || error.message?.startsWith('I need') ? error.message : 'Counter setup failed. Check the category, Manage Channels permission and Server Members intent.');}
  }
  async validate(guild,category) {
    if(!category || category.type!==ChannelType.GuildCategory || category.guild.id!==guild.id) throw new Error('The category must belong to this server.');
    const me=guild.members.me ?? await guild.members.fetchMe();
    if(!category.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) throw new Error('I need Manage Channels in that category.');
  }
  async refresh(guild) {
    const cfg=this.state.guilds[guild.id]; if(!cfg) return;
    const category=await guild.channels.fetch(cfg.categoryId);
    await this.validate(guild,category);
    if(!this.loaded.has(guild.id)) {await guild.members.fetch({withPresences:this.presences});this.loaded.add(guild.id);}
    const counts=memberCounts(guild.members.cache);
    if(counts.Total!==guild.memberCount) {await guild.members.fetch({withPresences:this.presences});Object.assign(counts,memberCounts(guild.members.cache));}
    if(counts.Total!==guild.memberCount) throw new Error('Member cache is incomplete');
    const channels=await guild.channels.fetch();
    if(category.name!==COUNTER_CATEGORY) await category.setName(COUNTER_CATEGORY);
    const names=counterNames(counts,this.presences?presenceCounts(guild.members.cache):null);
    // Retain the three existing channel IDs: brand, presence row, member row.
    for(const label of ['Bots','Users','Total']) {
      const name=names[label];
      let channel=cfg.channels[label] ? channels.get(cfg.channels[label]) : undefined;
      if(!channel) channel=[...channels.values()].find(c=>c?.parentId===category.id && c.type===ChannelType.GuildVoice && (c.name===name || c.name.startsWith(`${label} : `)));
      if(channel && (channel.parentId!==category.id || channel.type!==ChannelType.GuildVoice)) throw new Error('Counter channel was moved; operator review required');
      if(!channel) channel=await guild.channels.create({name,type:ChannelType.GuildVoice,parent:category.id,permissionOverwrites:[
        {id:guild.id,deny:[PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]},
        {id:this.client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ManageChannels]}
      ]});
      if(cfg.channels[label]!==channel.id) {cfg.channels[label]=channel.id;await this.save(this.state);}
      const everyone=channel.permissionOverwrites.cache.get(guild.id);
      if(!everyone?.deny.has(PermissionFlagsBits.Connect|PermissionFlagsBits.Speak)) await channel.permissionOverwrites.edit(guild.id,{Connect:false,Speak:false});
      const self=channel.permissionOverwrites.cache.get(this.client.user.id);
      if(!self?.allow.has(PermissionFlagsBits.ViewChannel|PermissionFlagsBits.ManageChannels)) await channel.permissionOverwrites.edit(this.client.user.id,{ViewChannel:true,ManageChannels:true});
      if(channel.name!==name) await channel.setName(name);
    }
  }
  schedule(guild) {
    if(!this.state.guilds[guild.id] || this.timers.has(guild.id)) return;
    const timer=setTimeout(()=>{
      this.timers.delete(guild.id);
      this.serialize(()=>this.refresh(guild)).catch(()=>console.error('Counter refresh failed; will retry on next refresh'));
    },300000); timer.unref();this.timers.set(guild.id,timer);
  }
  async start() {
    for(const id of Object.keys(this.state.guilds)) {
      const guild=this.client.guilds.cache.get(id);
      if(guild) await this.serialize(()=>this.refresh(guild)).catch(()=>console.error('Counter startup refresh failed'));
    }
  }
}
export async function createCounters(client,file,presences=false) {return new Counters(client,await loadCounters(file),state=>saveState(file,state),presences);}
