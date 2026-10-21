// The identity is always the Discord interaction actor, never a username/option.
export async function recoveryRequest(action,discordId,extra={},request=fetch){
 const base=new URL(process.env.METAGAME_URL || 'http://127.0.0.1:61000');
 if(base.protocol!=='http:'||base.hostname!=='127.0.0.1'||base.username||base.password)throw Error('Recovery requires loopback');
 const secret=process.env.KEY_RECOVERY_SERVICE_SECRET;
 if(!secret||secret.length<32)throw Error('Recovery not configured');
 const response=await request(new URL(`/internal/key-recovery/${action}`,base),{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
  headers:{'content-type':'application/json','x-key-recovery-service':secret},
  body:JSON.stringify({...extra,discordId})
 });
 if(!response.ok)throw Error('Recovery unavailable');
 return response.json();
}
export const KEY_SHARING_WARNING='This key is linked to your Discord account. Keep it private. If another player misuses it, your access/key may also be revoked. Use the same key only on your own devices.';
export async function sendPrivately(interaction, content, files=[]){
 // Never fall back to a public response if this helper is called elsewhere.
 if(interaction.ephemeral !== true) throw Error('Private acknowledgement required');
 try {
  await interaction.user.send({content,files,allowedMentions:{parse:[]}});
 } catch {
  await interaction.editReply({content,files,allowedMentions:{parse:[]}});
  return 'ephemeral';
 }
 await interaction.editReply('Your copy is in your DMs. Keep it private.');
 return 'dm';
}
export async function resendInteraction(interaction,keys,formatInvite,formatBackup){
 if(interaction.ephemeral !== true) throw Error('Private acknowledgement required');
 // Never issue another account or resurrect a redeemed registration invite.
 const result=await keys.run(interaction.user.id,false);
 if(result.status==='ready'){
  await sendPrivately(interaction,formatInvite(result.code)+'\n\n'+KEY_SHARING_WARNING);
  return;
 }
 if(result.status==='banned'){await interaction.editReply('Access is restricted. Contact support.');return;}
 if(['linked','redeemed'].includes(result.status)&&process.env.KEY_RECOVERY_SERVICE_SECRET){
  const copy=await recoveryRequest('copy',interaction.user.id);
  if(copy.status==='ready'&&typeof copy.key==='string'&&/^UUK_[A-Za-z0-9_-]{16,128}$/.test(copy.key)){
   const files=formatBackup?[{attachment:Buffer.from(formatBackup(copy.key,copy.username),'utf8'),name:'Dauntless-Unbroken-account-key.txt'}]:[];
   await sendPrivately(interaction,`🔑 **Your Existing Account Key**\n\`\`\`\n${copy.key}\n\`\`\`\nUse **Import account backup** or paste this key in the launcher on your Steam Deck or other PC. Your save and your original PC key stay unchanged.\n\n${KEY_SHARING_WARNING}`,files);
   return;
  }
  await interaction.editReply(copy.status==='cooldown'?'Too many key requests. Wait 15 minutes and try again.':copy.status==='banned'?'Access is restricted. Contact support.':'Verify ownership once with `/key link key:<your existing account key>`, then use `/key resend`. Find it on your PC Desktop or in launcher Settings > Save a backup of your key. No new account was created.');
  return;
 }
 await interaction.editReply(process.env.KEY_RECOVERY_SERVICE_SECRET
  ? 'An unused saved invite could not be resent. If you already registered and verified /key link, use /key recover for a replacement account key. Otherwise contact support.'
  : 'An unused saved invite could not be resent. If you already registered, contact support to recover your existing account key. Account-key recovery is not enabled yet; no new invite was issued.');
}
export async function recoverInteraction(interaction){
 if(interaction.ephemeral !== true) throw Error('Private acknowledgement required');
 const id=interaction.user.id;
 const challenge=interaction.options.getString('confirm');
 if(!challenge){
  const result=await recoveryRequest('begin',id);
  await interaction.editReply(result.challenge
   ? `Recovery requires an account link previously verified with your launcher key using /key link. No username or moderator role is sufficient. Confirm within five minutes with:\n/key recover confirm:${result.challenge}\nThis revokes your old key. If you never verified a link and lost the key, contact support.`
   : 'Recovery is unavailable or on cooldown. Try later or contact support.');
  return;
 }
 // Confirm the private interaction is still writable before rotating. Blocked DMs
 // are supported through this already-ephemeral acknowledgement.
 await interaction.editReply('Verifying your recovery request…');
 const result=await recoveryRequest('confirm',id,{challenge});
 if(!result.key){await interaction.editReply('Recovery could not be verified or is on cooldown. Use /key link with your existing key, or contact support.');return;}
 try{
  await sendPrivately(interaction,`🔑 **Replacement Account Key**\n\`\`\`\n${result.key}\n\`\`\`\nYour old key is revoked. Save this key and sign in again.`);
 }catch{
  await interaction.editReply('Your old key was revoked, but Discord did not confirm delivery. Check your DMs; if missing, repeat recovery after the cooldown.');
 }
}
