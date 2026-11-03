import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import {EventEmitter} from 'node:events';
import ts from 'typescript';

test('AppImage replacement is atomic, uniquely staged, cleaned up, and retryable after failure',async()=>{
    const root=await fs.promises.mkdtemp(path.join(tmpdir(),'unbroken-updater-'));
    const target=path.join(root,'launcher.AppImage'),staged:string[]=[],relaunched:unknown[]=[];
    const source=ts.transpileModule(fs.readFileSync('src/main/linux-updater.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    let fail=true;
    const module={exports:{}};
    const localFs={...fs,promises:{...fs.promises,
        copyFile:async(from:string,to:string,flags?:number)=>{staged.push(to);return fs.promises.copyFile(from,to,flags);},
        chmod:async(file:string,mode:number)=>{if(fail)throw Error('test chmod failure');return fs.promises.chmod(file,mode);}
    }};
    const requireMock=(name:string):unknown=>name==='electron'?{app:{getPath:()=>root,relaunch:(options:unknown)=>relaunched.push(options)}}
        :name==='node:fs'?localFs:name==='./launch'?{launcherRelaunchOptions:(_platform:string,file:string)=>({execPath:file})}:require(name);
    runInNewContext(source,{exports:module.exports,module,require:requireMock,process:{env:{APPIMAGE:target}},Buffer,fetch:async()=>new Response('new AppImage')});
    const install=(module.exports as {installLinuxUpdate:(u:unknown)=>Promise<string>}).installLinuxUpdate;
    try{
        await fs.promises.writeFile(target,'original');
        const update={url:'https://example.invalid/launcher.AppImage',kind:'appimage',version:'1.0.34'};
        await assert.rejects(install(update),/test chmod failure/);
        assert.equal(await fs.promises.readFile(target,'utf8'),'original');
        assert.deepEqual(await fs.promises.readdir(root),['launcher.AppImage']);
        fail=false;assert.equal(await install(update),'relaunch');
        assert.equal(await fs.promises.readFile(target,'utf8'),'new AppImage');
        assert.equal(relaunched.length,1);assert.notEqual(staged[0],staged[1]);
        assert.ok(staged.every(file=>path.dirname(file)===root&&file.startsWith(target+'.new-')));
        assert.deepEqual(await fs.promises.readdir(root),['launcher.AppImage']);
    }finally{await fs.promises.rm(root,{recursive:true,force:true});}
});

test('Linux package updates pass paths as arguments to pkexec without a shell',async()=>{
    const root=await fs.promises.mkdtemp(path.join(tmpdir(),'updater-$()-'));
    const source=ts.transpileModule(fs.readFileSync('src/main/linux-updater.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const calls:Array<{program:string,args:string[]}>=[];
    const module={exports:{}};
    const requireMock=(name:string):unknown=>name==='electron'?{app:{getPath:()=>root}}
        :name==='node:child_process'?{spawn:(program:string,args:string[])=>{calls.push({program,args});const child=new EventEmitter() as EventEmitter & {unref:()=>void};child.unref=()=>{};queueMicrotask(()=>{child.emit('spawn');child.emit('exit',0,null);});return child;}}
        :name==='./launch'?{}:require(name);
    runInNewContext(source,{exports:module.exports,module,require:requireMock,process:{env:{}},Buffer,fetch:async()=>new Response('package')});
    const install=(module.exports as {installLinuxUpdate:(u:unknown)=>Promise<string>}).installLinuxUpdate;
    try {
        for(const kind of ['deb','rpm']){
            assert.equal(await install({url:'https://example.invalid/package',kind,version:'1.2.3'}),'quit');
            const call=calls.at(-1)!;
            assert.equal(call.program,'pkexec');
            assert.equal(call.args[0],kind==='deb'?'apt':'rpm');
            assert.ok(call.args.at(-1)!.startsWith(root));
            assert.ok(call.args.at(-1)!.includes('$()'));
        }
    } finally {await fs.promises.rm(root,{recursive:true,force:true});}
});

test('a missing Linux installer reports an error and removes the download',async()=>{
    const root=await fs.promises.mkdtemp(path.join(tmpdir(),'unbroken-updater-'));
    const source=ts.transpileModule(fs.readFileSync('src/main/linux-updater.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const module={exports:{}};
    const requireMock=(name:string):unknown=>name==='electron'?{app:{getPath:()=>root}}
        :name==='node:child_process'?{spawn:()=>{const child=new EventEmitter();queueMicrotask(()=>child.emit('error',Object.assign(new Error('pkexec missing'),{code:'ENOENT'})));return child;}}
        :name==='./launch'?{}:require(name);
    runInNewContext(source,{exports:module.exports,module,require:requireMock,process:{env:{}},Buffer,fetch:async()=>new Response('package')});
    const install=(module.exports as {installLinuxUpdate:(u:unknown)=>Promise<string>}).installLinuxUpdate;
    try {
        await assert.rejects(install({url:'https://example.invalid/package',kind:'deb',version:'1.2.3'}),/pkexec missing/);
        assert.deepEqual(await fs.promises.readdir(root),[]);
    } finally {await fs.promises.rm(root,{recursive:true,force:true});}
});

test('Linux package updates wait for the installer and report authorization failure',async()=>{
    const root=await fs.promises.mkdtemp(path.join(tmpdir(),'unbroken-updater-'));
    const source=ts.transpileModule(fs.readFileSync('src/main/linux-updater.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const module={exports:{}}; let child:EventEmitter;
    const requireMock=(name:string):unknown=>name==='electron'?{app:{getPath:()=>root}}
        :name==='node:child_process'?{spawn:()=>{child=new EventEmitter();(child as any).unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}}
        :name==='./launch'?{}:require(name);
    runInNewContext(source,{exports:module.exports,module,require:requireMock,process:{env:{}},Buffer,fetch:async()=>new Response('package')});
    const install=(module.exports as {installLinuxUpdate:(u:unknown)=>Promise<string>}).installLinuxUpdate;
    try {
        const pending=install({url:'https://example.invalid/package',kind:'deb',version:'1.2.3'});
        let settled=false; void pending.then(()=>{settled=true;},()=>{settled=true;});
        await new Promise(resolve=>setTimeout(resolve,50));
        assert.equal(settled,false);
        child!.emit('exit',126,null);
        await assert.rejects(pending,/installer.*126/i);
        assert.deepEqual(await fs.promises.readdir(root),[]);
    } finally {await fs.promises.rm(root,{recursive:true,force:true});}
});
