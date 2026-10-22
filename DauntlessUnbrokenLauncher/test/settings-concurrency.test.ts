import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {SettingsStore} from '../src/main/settings';

test('background backup completion and account settings updates preserve each other when the temporary file is locked',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'unbroken-settings-'));
  const write=fs.writeFile;let writing=false;
  t.mock.method(fs,'writeFile',async(...args:Parameters<typeof fs.writeFile>)=>{
    if(writing)throw Object.assign(Error('Temporary settings file is in use'),{code:'EBUSY'});
    writing=true;
    try{await new Promise(r=>setTimeout(r,20));return await write(...args);}finally{writing=false;}
  });
  try{
    const store=new SettingsStore(dir,'en');
    await Promise.all([store.update(s=>{s.windowed=true;}),store.update(s=>{s.discordPresence=false;}),store.update(s=>{s.streamerMode=true;})]);
    const saved=JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8'));
    assert.equal(saved.windowed,true);assert.equal(saved.discordPresence,false);assert.equal(saved.streamerMode,true);
    await assert.rejects(store.update(()=>{throw Error('failed change');}));
    await store.update(s=>{s.windowed=false;});
    assert.equal(new SettingsStore(dir,'en').get().windowed,false);
  }finally{await rm(dir,{recursive:true,force:true});}
});
