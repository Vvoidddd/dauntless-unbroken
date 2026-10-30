import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {findBackupFiles} from '../src/main/backup-browser';

test('backup discovery is bounded to small text files directly inside configured folders',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'unbroken-backup-list-'));
  try{
    await fs.mkdir(path.join(dir,'nested'));
    await fs.writeFile(path.join(dir,'backup.TXT'),'example');
    await fs.writeFile(path.join(dir,'nested','hidden.txt'),'example');
    await fs.writeFile(path.join(dir,'huge.txt'),'x'.repeat(8193));
    await fs.writeFile(path.join(dir,'empty.txt'),'');
    await fs.writeFile(path.join(dir,'other.bin'),'example');
    assert.deepEqual(await findBackupFiles([dir,dir,path.join(dir,'missing')]),[path.join(dir,'backup.TXT')]);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
