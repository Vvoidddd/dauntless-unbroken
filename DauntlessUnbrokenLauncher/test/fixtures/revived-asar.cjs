// Runs in Electron, where node:fs has ASAR virtualization enabled.
const {app}=require('electron');
const fs=require('original-fs').promises;
const path=require('node:path'),assert=require('node:assert/strict'),os=require('node:os');
const {RevivedManager}=require('../../.test-build/src/main/revived.js');
app.whenReady().then(async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'unbroken-asar-cleanup-'));
 console.log('FIXTURE '+base);
 try{
  const local=path.join(base,'local'),roaming=path.join(base,'roaming'),keep=path.join(local,'DauntlessUnbrokenLauncher');
  const install=path.join(local,'DauntlessRevivedLauncher'),input=path.join(base,'input');
  for(const dir of [roaming,keep,input])await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(keep,'keep.txt'),'Unbroken');
  await fs.writeFile(path.join(input,'package.json'),'{}');
  await fs.mkdir(path.join(input,'.vite','build'),{recursive:true});
  await fs.writeFile(path.join(input,'.vite','build','main.js'),'old launcher');
  const {createPackage}=await import('@electron/asar');
  for(const version of ['0.1.39','0.1.42']){
   const resources=path.join(install,'app-'+version,'resources');await fs.mkdir(resources,{recursive:true});
   const archive=path.join(resources,'app.asar');await createPackage(input,archive);
   assert.equal((await fs.lstat(archive)).isFile(),true);
  }
  const profile=path.join(roaming,'dauntless-revived-launcher');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'account.key'),'fixture key');
  const states=[];
  const manager=new RevivedManager({platform:'win32',local,roaming,shortcuts:[],protectedPaths:()=>[keep],changed:s=>states.push(s),native:async()=>{},checkPort:async()=>true});
  try{await manager.remove();}catch(error){console.error(manager.state.message);throw error;}
  assert.equal(manager.state.phase,'done');
  await assert.rejects(fs.stat(install),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(keep,'keep.txt'),'utf8'),'Unbroken');
  assert.equal(await fs.readFile(path.join(manager.state.backupPath,path.basename(profile),'account.key'),'utf8'),'fixture key');
  assert.ok(states.some(s=>s.currentFile==='app.asar'));
  assert.ok(!states.some(s=>s.currentFile==='package.json'));
  console.log('PASS: two physical ASAR archives removed; Unbroken and profile backup preserved.');
 }finally{
  assert.ok(path.resolve(base).startsWith(path.resolve(os.tmpdir())+path.sep));
  await fs.rm(base,{recursive:true,force:true});
 }
}).then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
