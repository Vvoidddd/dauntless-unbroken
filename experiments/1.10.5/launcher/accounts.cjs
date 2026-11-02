const {createHash}=require('node:crypto');
const {extractAccountKey,parseInvite,isValidInviteCode}=require('./shared.cjs');
function inviteCode(text,host,fingerprint=null){
 if(typeof text!=='string')throw Error('Paste your test invite.');text=text.trim();if(isValidInviteCode(text))return text;
 const parsed=parseInvite(text);if(!parsed.ok)throw Error('Paste the complete dauntless-unbroken:// invite link.');
 if(parsed.invite.mode!==(fingerprint?'public':'private')||parsed.invite.host!==host||parsed.invite.port!==62002||parsed.invite.fp!==fingerprint)throw Error('This invite is for a different realm. Ask for a 1.10.5 test invite.');return parsed.invite.code;
}
class Accounts{
 constructor(state,secure,save,lookup){this.state=state;this.secure=secure;this.save=save;this.lookup=lookup;
  state.accounts??=[];if(state.key){const id=state.uid||'legacy';state.accounts.push({id,name:state.name||'Account',uid:state.uid,key:state.key});state.active=id;delete state.key;delete state.name;delete state.uid;save();}
 }
 get current(){return this.state.accounts.find(a=>a.id===this.state.active);}
 get key(){const a=this.current;return a?this.secure.decryptString(Buffer.from(a.key,'base64')):'';}
 list(){return this.state.accounts.map(({id,name})=>({id,name,selected:id===this.state.active}));}
 store(key,user){
  if(!this.secure.isEncryptionAvailable())throw Error('Windows could not securely store this account.');
  const id=createHash('sha256').update(key).digest('hex').slice(0,20),entry={id,name:user.Username,uid:user.UserId||'',key:this.secure.encryptString(key).toString('base64')};
  const old=this.state.accounts.findIndex(a=>a.id===id||(entry.uid&&a.uid===entry.uid));if(old>=0)this.state.accounts[old]=entry;else this.state.accounts.push(entry);
  this.state.active=id;this.save();
 }
 async login(text,invite){const key=extractAccountKey(text);if(!key)throw Error('That does not look like an account key. Paste the Key line or your complete backup.');
  const user=await this.lookup(key,invite);if(typeof user.Username!=='string'||typeof user.UserId!=='string')throw Error('Invalid account response');this.store(key,user);
 }
 async switch(id){const a=this.state.accounts.find(a=>a.id===id);if(!a)throw Error('Saved account not found');await this.login(this.secure.decryptString(Buffer.from(a.key,'base64')));}
 logout(){this.state.active=null;this.save();}
 remove(id){this.state.accounts=this.state.accounts.filter(a=>a.id!==id);if(this.state.active===id)this.state.active=null;this.save();}
}
module.exports={Accounts,inviteCode};
