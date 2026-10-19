import {GetDb} from '../db';
import {randomBytes} from 'node:crypto';
import {KeyRevocations} from './keyrotation';
import {DiscordAccount} from './discordlinks';
import {BanFor,ModerationInfo,SetAccountBan} from './moderation';

export const ValidDiscordId=(id:unknown):id is string=>typeof id==='string' && /^\d{17,20}$/.test(id);
export function AccessAudit(accountId:string|null,discordId:string|null,action:string,reason:string,actor:string) {
    GetDb().$client.prepare('INSERT INTO account_access_events(accountId,discordId,action,reason,actor,createdAt) VALUES(?,?,?,?,?,?)').run(accountId,discordId,action,reason,actor,Date.now());
}
export function DiscordBan(discordId:string) {
    return GetDb().$client.prepare('SELECT reason FROM discord_moderation WHERE discordId=? AND active=1').get(discordId) as {reason:string}|undefined;
}
export function DiscordAccess(discordId:unknown) {
    if(!ValidDiscordId(discordId))throw Error('invalid_discord_id');
    const db=GetDb().$client,account=DiscordAccount(discordId);
    const invite=db.prepare('SELECT d.inviteCode,i.usesRemaining,i.infiniteUses FROM discord_invites d LEFT JOIN invitecodes i ON i.invitecode=d.inviteCode WHERE d.discordId=?').get(discordId) as any;
    return {discordId,account:account??null,ban:DiscordBan(discordId)??(account?BanFor(account.userId):null)??null,
        invite:invite?{code:invite.inviteCode,status:invite.usesRemaining==null?'revoked':invite.usesRemaining===0?'redeemed':'ready'}:null,
        moderation:db.prepare('SELECT * FROM discord_moderation WHERE discordId=?').get(discordId)??null};
}
// One durable invite owner; a retry never refills an invite or replaces a revoked one.
export function CreateDiscordInvite(discordId:unknown,code:unknown) {
    if(!ValidDiscordId(discordId))throw Error('invalid_discord_id');
    const db=GetDb().$client;
    if(code===undefined)code=(db.prepare('SELECT inviteCode FROM discord_invites WHERE discordId=?').get(discordId) as any)?.inviteCode??'DR-'+randomBytes(18).toString('hex');
    if(typeof code!=='string'||!/^DR-[a-f0-9]{36}$/.test(code))throw Error('invalid_discord_invite');
    return db.transaction(()=>{
        if(DiscordBan(discordId))throw Error('discord_banned');
        if(DiscordAccount(discordId))throw Error('already_linked');
        const owner=db.prepare('SELECT discordId,inviteCode FROM discord_invites WHERE discordId=? OR inviteCode=?').get(discordId,code) as any;
        if(owner && (owner.discordId!==discordId||owner.inviteCode!==code))throw Error('invite_already_assigned');
        if(owner){
            const state=DiscordAccess(discordId);
            if(state.invite?.status!=='ready')throw Error('invite_not_unused');
            return {ok:true,code};
        }
        const old=db.prepare('SELECT usesRemaining,infiniteUses FROM invitecodes WHERE invitecode=?').get(code) as any;
        if(old && (old.usesRemaining!==1||old.infiniteUses))throw Error('invite_not_unused');
        if(!old)db.prepare('INSERT INTO invitecodes(invitecode,usesRemaining,infiniteUses) VALUES(?,1,0)').run(code);
        db.prepare('INSERT INTO discord_invites VALUES(?,?,?)').run(discordId,code,Date.now());
        return {ok:true,code};
    }).immediate();
}
export function SetDiscordBan(body:any,actor:string) {
    if(!body || !ValidDiscordId(body.discordId)||!ValidDiscordId(body.guildId)||typeof body.active!=='boolean'||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>500||typeof (body.includeIp??false)!=='boolean')throw Error('invalid_discord_ban');
    const db=GetDb().$client;
    const result=db.transaction(()=>{
        const account=DiscordAccount(body.discordId);
        if(account){
            const info=ModerationInfo(account.userId);
            const address=body.active && body.includeIp ? info.addresses[0]?.address : null;
            if(body.active && body.includeIp && !address)throw Error('address_not_observed');
            SetAccountBan(account.userId,body.reason,body.active,address,actor);
        }else if(body.active && body.includeIp)throw Error('account_not_linked');
        db.prepare(`INSERT INTO discord_moderation(discordId,guildId,active,reason,actor,revision,updatedAt,syncStatus) VALUES(?,?,?,?,?,1,?,'pending')
            ON CONFLICT(discordId) DO UPDATE SET guildId=excluded.guildId,active=excluded.active,reason=excluded.reason,actor=excluded.actor,revision=revision+1,updatedAt=excluded.updatedAt,syncStatus='pending',syncError=NULL`)
            .run(body.discordId,body.guildId,Number(body.active),body.reason.trim(),actor,Date.now());
        AccessAudit(account?.userId??null,body.discordId,body.active?'discord_ban':'discord_unban',body.reason.trim(),actor);
        return DiscordAccess(body.discordId);
    }).immediate();
    if(body.active && result.account)KeyRevocations.emit('revoke',result.account.userId);
    return result;
}
export function PendingDiscordBans(guildId:unknown) {
    if(!ValidDiscordId(guildId))throw Error('invalid_guild_id');
    return GetDb().$client.prepare("SELECT * FROM discord_moderation WHERE guildId=? AND syncStatus<>'synced' ORDER BY updatedAt LIMIT 25").all(guildId);
}
export function AckDiscordBan(body:any) {
    if(!body||!ValidDiscordId(body.discordId)||!ValidDiscordId(body.guildId)||!Number.isSafeInteger(body.revision)||!['synced','error'].includes(body.status)||typeof (body.error??'')!=='string'||(body.error??'').length>100)throw Error('invalid_sync_result');
    const changed=GetDb().$client.prepare('UPDATE discord_moderation SET syncStatus=?,syncError=? WHERE discordId=? AND guildId=? AND revision=?').run(body.status,body.status==='error'?body.error:null,body.discordId,body.guildId,body.revision).changes;
    return {ok:changed===1};
}
