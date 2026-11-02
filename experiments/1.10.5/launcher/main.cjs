const {app,BrowserWindow,ipcMain,dialog,safeStorage}=require('electron');
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {spawn,execFile}=require('node:child_process');
const {backupFileText,desktopKeyPath,isValidUsername,extractAccountKey}=require('./shared.cjs');
const {Accounts,inviteCode}=require('./accounts.cjs');
const {install,digest,MANIFEST_SHA}=require('./install.cjs');
const config=require('./config.json'),transport=require('./transport.cjs');
let window,state={},accounts,gameProcess,bridge,chatBridge,busy=false,downloadController,lastProgress;
const data=()=>path.join(app.getPath('userData'),'profile.json');
function save(){fs.writeFileSync(data()+'.tmp',JSON.stringify(state));fs.renameSync(data()+'.tmp',data());}
function progress(value){lastProgress=typeof value==='string'?{detail:value}:value;if(window&&!window.isDestroyed())window.webContents.send('progress',lastProgress);}
async function api(route,body,credential=accounts?.key||''){
 return transport.request(config,route,body,credential);
}
const exe=folder=>path.join(folder,'Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe');
async function verify(folder){if(await digest(exe(folder),'sha256')!==config.gameHash)throw Error('Choose the 1.10.5 game folder. Your regular game must use its own launcher.');}
function snapshot(){return {name:accounts?.current?.name||'',accounts:accounts?.list()||[],folder:state.folder||state.installFolder||'',running:!!gameProcess,host:config.host,build:app.getVersion(),busy,progress:lastProgress};}
async function installGame(){
 if(!accounts.key)throw Error('Sign in first.');await api('/unbroken/api/GetUserInfo');
 const picked=await dialog.showOpenDialog(window,{title:'Choose the parent folder or an existing Unbroken1105Game folder to resume',defaultPath:state.installFolder||state.folder,properties:['openDirectory','createDirectory']});
 if(picked.canceled)return;
 const chosen=picked.filePaths[0],folder=path.basename(chosen).toLowerCase()==='unbroken1105game'?chosen:path.join(chosen,'Unbroken1105Game');
 await fsp.mkdir(folder,{recursive:true});if((await fsp.lstat(folder)).isSymbolicLink())throw Error('Choose a normal folder, not a directory link.');
 const marker=path.join(folder,'.unbroken-1105-install.json');
 if(fs.existsSync(marker)){if((await fsp.lstat(marker)).isSymbolicLink()||JSON.parse(await fsp.readFile(marker,'utf8')).manifest!==MANIFEST_SHA)throw Error('This folder belongs to a different installation.');}
 else{if((await fsp.readdir(folder)).length)await verify(folder);await fsp.writeFile(marker,JSON.stringify({manifest:MANIFEST_SHA}),{flag:'wx'});}
 const indexBytes=await fsp.readFile(path.join(__dirname,'install-index.json'));
 if(crypto.createHash('sha256').update(indexBytes).digest('hex')!==config.indexHash)throw Error('Installer metadata is damaged. Download the launcher again.');
 state.installFolder=folder;save();downloadController=new AbortController();
 try{await install(JSON.parse(indexBytes),folder,{signal:downloadController.signal,onProgress:progress});await verify(folder);state.folder=folder;save();}
 catch(e){if(downloadController.signal.aborted)throw Error('Download paused. Press Download / repair to resume.');throw e;}
 finally{downloadController=null;}
}
async function backup(){
 const key=accounts.key;if(!key)throw Error('Sign in first.');
 const opts={serverName:'Dauntless Unbroken 1.10.5 Test',host:config.host,port:62002,fingerprint:config.fingerprint,username:accounts.current.name,key,date:new Date()};
 const dest=await dialog.showSaveDialog(window,{defaultPath:desktopKeyPath(app.getPath('desktop'),opts),filters:[{name:'Dauntless Unbroken account backup',extensions:['txt']}]});
 if(!dest.canceled)await fsp.writeFile(dest.filePath,backupFileText(opts));
}
async function launch(){
 const key=accounts.key;if(!key)throw Error('Sign in first.');if(!state.folder)throw Error('Choose or download the 1.10.5 game first.');
 const user=await api('/unbroken/api/GetUserInfo');progress('Checking the exact 1.10.5 executable…');await verify(state.folder);
 const bin=path.dirname(exe(state.folder)),escaped=exe(state.folder).replaceAll("'","''");
 const running=await new Promise((resolve,reject)=>execFile(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',`Get-CimInstance Win32_Process -Filter "Name='Dauntless-Win64-Shipping.exe'" | Where-Object { $_.ExecutablePath -eq '${escaped}' -and $_.CommandLine -notmatch '(^|\\s)-server(\\s|$)' } | Select-Object -ExpandProperty ProcessId`],{windowsHide:true,timeout:10000},(e,out)=>e?reject(Error('Could not check whether the game is already running.')):resolve(out.trim())));
 if(running)throw Error('The test game is already running. Close it before starting another.');
 for(const name of ['dxgi.dll','DauntlessUnbroken.dll']){
  const source=path.join(process.resourcesPath,'lab-native',name),target=path.join(bin,name);
  try{const expected=await digest(source,'sha256');if(expected!==await digest(target,'sha256').catch(()=>''))await fsp.copyFile(source,target);if(await digest(target,'sha256')!==expected)throw Error('File verification failed.');}
  catch(e){if(['ENOENT','EACCES','EPERM'].includes(e.code))throw Error(`Required game file is missing or blocked: ${name}. Check Windows Security > Protection history for this file, then reinstall the complete test launcher from the host. Keep your account backup. Do not turn off protection.`);throw e;}
 }
 const profile=path.join(app.getPath('userData'),'game-profile');await fsp.mkdir(profile,{recursive:true});
 const configDir=path.join(profile,'Archon/Saved/Config/WindowsClient');await fsp.mkdir(configDir,{recursive:true});
 const engine=path.join(configDir,'Engine.ini');let ini=await fsp.readFile(engine,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return '';});
 ini=ini.replace(/^\[OnlineSubsystemMcp\.XMPP\][\s\S]*?(?=^\[|(?![\s\S]))/gm,'');
 await fsp.writeFile(engine,ini+'\n[OnlineSubsystemMcp.XMPP]\nServerAddr=ws://127.0.0.1\nServerPort=62099\nbUseSSL=false\nDomain=localhost\n');
 try{
  bridge=transport.createBridge(config);chatBridge=transport.createBridge(config,true);
  for(const [server,port] of [[bridge,62002],[chatBridge,62099]])await new Promise((resolve,reject)=>{server.once('error',()=>reject(Error(`Local port ${port} is busy. Close the other test launcher or server.`)));server.listen(port,'127.0.0.1',resolve);});
 }catch(e){bridge?.stop();chatBridge?.stop();bridge=chatBridge=null;throw e;}
 const args=['-AUTH_LOGIN=unused',`-AUTH_PASSWORD=${key}`,'-AUTH_TYPE=exchangecode','-EpicPortal','-epicapp=Jackal','-epicenv=Prod',`-epicusername=${user.Username}`,`-epicuserid=${user.UserId}`,'-NoEAC','-culture=en',`-UserDir=${profile.replaceAll('\\','/')}/`,'-SaveToUserDir'];
 gameProcess=spawn(exe(state.folder),args,{cwd:bin,env:{...process.env,DR_1105_LOCAL_LAB:'1',DR_1105_HOST:'127.0.0.1',DR_1105_LOG:path.join(app.getPath('userData'),'native-client.log')},stdio:'ignore'});
 const ended=message=>{gameProcess=null;bridge?.stop();chatBridge?.stop();bridge=chatBridge=null;progress(message);if(window&&!window.isDestroyed())window.webContents.send('state',snapshot());else app.quit();};
 gameProcess.once('error',()=>ended('The game could not start.'));
 gameProcess.once('exit',code=>ended(code?`Game exited (${code}).`:'Game closed.'));progress('Game started. Keep this launcher running.');
}
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>{window?.show();window?.focus();});
 app.whenReady().then(()=>{
  try{state=JSON.parse(fs.readFileSync(data()));}catch(e){if(e.code!=='ENOENT'){dialog.showErrorBox('Profile could not load','Your profile was kept. The profile file could not be read.');app.quit();return;}}
  accounts=new Accounts(state,safeStorage,save,(key,invite)=>api('/test/login',{InviteCode:invite?inviteCode(invite,config.host,config.fingerprint):''},key));
  window=new BrowserWindow({width:980,height:900,minWidth:760,minHeight:650,title:'Dauntless Unbroken · 1.10.5 Test',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());
  window.on('close',e=>{if(downloadController){e.preventDefault();dialog.showMessageBox(window,{type:'question',message:'Pause the download and close?',detail:'Verified files and chunks will be kept for resuming.',buttons:['Keep downloading','Pause and close'],defaultId:0,cancelId:0}).then(({response})=>{if(response===1){downloadController?.abort();const timer=setInterval(()=>{if(!busy){clearInterval(timer);window.close();}},100);}});}});
  ipcMain.handle('action',async(event,action,value)=>{
   if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('Invalid frame');
   if(action==='status')return {ok:true,state:snapshot()};
   if(action==='pause'){downloadController?.abort();return {ok:true,state:snapshot()};}
   if(busy||gameProcess)return {ok:false,error:'Close the game or wait for the current task first.',state:snapshot()};
   busy=true;window.webContents.send('state',snapshot());let error;
   try{
    if(action==='import'){const picked=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Account backup',extensions:['txt']}]});if(!picked.canceled){if((await fsp.stat(picked.filePaths[0])).size>8192)throw Error('Account backup is too large.');await accounts.login(await fsp.readFile(picked.filePaths[0],'utf8'),value);}}
    else if(action==='signin')await accounts.login(value?.key,value?.invite);
    else if(action==='switch')await accounts.switch(value);
    else if(action==='logout')accounts.logout();
    else if(action==='remove')accounts.remove(value);
    else if(action==='register'){
     if(!value||!isValidUsername(value.name))throw Error('Use 3–16 letters, numbers or underscores for your name.');const code=inviteCode(value.invite,config.host,config.fingerprint);
     if(!safeStorage.isEncryptionAvailable())throw Error('Windows could not securely store this account.');
     const user=await api('/unbroken/api/Register',{Username:value.name,InviteCode:code},'');if(!extractAccountKey(user.UUK))throw Error('Invalid registration response.');
     // Persist the new key before another network request: a used invite must not strand an account.
     accounts.store(user.UUK,{Username:value.name,UserId:user.UserId});
     try{await accounts.login(user.UUK);}catch{progress('Account created and key saved. Save a backup; retry sign-in when the server responds.');}await backup();
    }
    else if(action==='backup')await backup();
    else if(action==='folder'){const picked=await dialog.showOpenDialog(window,{properties:['openDirectory']});if(!picked.canceled){await verify(picked.filePaths[0]);state.folder=picked.filePaths[0];save();}}
    else if(action==='download')await installGame();
    else if(action==='play')await launch();
    else throw Error('Unknown action');
   }catch(e){error=e.message;}finally{busy=false;}
   return {ok:!error,error,state:snapshot()};
  });window.loadFile(path.join(__dirname,'index.html'));
 });
 app.on('window-all-closed',()=>{if(!gameProcess)app.quit();});
}
