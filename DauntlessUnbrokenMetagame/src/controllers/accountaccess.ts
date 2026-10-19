import {randomBytes,createHash} from 'node:crypto';
import {GetDb} from '../db';
import {KeyRevocations} from './keyrotation';
import {LinkDiscordAccount} from './discordlinks';
import {AccessAudit,DiscordAccess,ValidDiscordId} from './discordaccess';

// Operator-only actions change access credentials, never character saves or inventory.
export function ManageAccountAccess(body:any,actor:string) {
    if(!body||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>500)throw Error('reason_required');
    const db=GetDb().$client;
    const result=db.transaction(()=>{
        if(body.action==='revoke-invite'){
            if(!ValidDiscordId(body.discordId))throw Error('invalid_discord_id');
            db.prepare('DELETE FROM invitecodes WHERE invitecode IN (SELECT inviteCode FROM discord_invites WHERE discordId=?)').run(body.discordId);
            AccessAudit(null,body.discordId,body.action,body.reason.trim(),actor);
            return {ok:true,discord:DiscordAccess(body.discordId)};
        }
        if(typeof body.accountId!=='string'||!/^UID-[A-Za-z0-9-]{1,100}$/.test(body.accountId))throw Error('invalid_account_id');
        const user=db.prepare('SELECT isAdmin FROM users WHERE userId=?').get(body.accountId) as any;
        if(!user)throw Error('account_not_found');
        if(user.isAdmin)throw Error('admin_account_protected');
        const link=db.prepare('SELECT discordId FROM discordlinks WHERE userId=?').get(body.accountId) as any;
        if(body.action==='link-discord'){
            const linked=LinkDiscordAccount(body.discordId,body.accountId);
            if(linked.status!=='linked')throw Error(linked.status);
        }else if(body.action==='unlink-discord'){
            db.prepare('DELETE FROM discordlinks WHERE userId=?').run(body.accountId);
            db.prepare('DELETE FROM recoveryproofs WHERE userId=?').run(body.accountId);
            db.prepare('DELETE FROM recoverychallenges WHERE userId=?').run(body.accountId);
        }else if(body.action==='revoke-key'||body.action==='rotate-key'){
            db.prepare('DELETE FROM userapikeys WHERE userId=?').run(body.accountId);
            db.prepare('DELETE FROM userapikeystoregister WHERE userId=?').run(body.accountId);
            db.prepare('DELETE FROM accountkeyrecovery WHERE userId=?').run(body.accountId);
            db.prepare('DELETE FROM recoveryproofs WHERE userId=?').run(body.accountId);
            db.prepare('DELETE FROM recoverychallenges WHERE userId=?').run(body.accountId);
            db.prepare('INSERT INTO authepochs(userId,epoch) VALUES(?,1) ON CONFLICT(userId) DO UPDATE SET epoch=epoch+1').run(body.accountId);
        }else throw Error('invalid_action');
        let key:string|undefined;
        if(body.action==='rotate-key'){
            key='UUK_'+randomBytes(32).toString('hex');
            db.prepare('INSERT INTO userapikeys VALUES(?,?)').run(body.accountId,createHash('sha256').update(key).digest('hex'));
        }
        AccessAudit(body.accountId,ValidDiscordId(body.discordId)?body.discordId:link?.discordId??null,body.action,body.reason.trim(),actor);
        return {ok:true,key};
    }).immediate();
    if(body.action==='revoke-key'||body.action==='rotate-key')KeyRevocations.emit('revoke',body.accountId);
    return result;
}
