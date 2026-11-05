import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const sha256=(value:string)=>createHash('sha256').update(value).digest('hex');

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
    const fetch=async()=>{
        const response=new Response('new AppImage');
        Object.defineProperty(response,'arrayBuffer',{value:()=>{throw Error('updater must stream response bodies');}});
        return response;
    };
    runInNewContext(source,{exports:module.exports,module,require:requireMock,process:{env:{APPIMAGE:target}},Buffer,fetch,AbortSignal});
    const install=(module.exports as {installLinuxUpdate:(u:unknown)=>Promise<string>}).installLinuxUpdate;
    try{
        await fs.promises.writeFile(target,'original');
        const update={url:'https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-v1.0.34/launcher.AppImage',kind:'appimage',version:'1.0.34',sha256:sha256('new AppImage'),size:12};
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

test('Linux updates reject missing or mismatched integrity metadata before replacing files',async()=>{
    const root=await fs.promises.mkdtemp(path.join(tmpdir(),'unbroken-updater-integrity-'));
    const target=path.join(root,'launcher.AppImage');
    const source=ts.transpileModule(fs.readFileSync('src/main/linux-updater.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const module={exports:{}};
    const requireMock=(name:string):unknown=>name==='electron'?{app:{getPath:()=>root,relaunch:()=>{}}}
        :name==='node:fs'?{...fs,promises:{...fs.promises}}
        :name==='./launch'?{launcherRelaunchOptions:()=>({})}:require(name);
    runInNewContext(source,{exports:module.exports,module,require:requireMock,process:{env:{APPIMAGE:target}},Buffer,fetch:async()=>new Response('new AppImage'),AbortSignal});
    const install=(module.exports as {installLinuxUpdate:(u:unknown)=>Promise<string>}).installLinuxUpdate;
    try{
        await fs.promises.writeFile(target,'original');
        await assert.rejects(install({url:'https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-v1.0.34/launcher.AppImage',kind:'appimage',version:'1.0.34'}),/integrity metadata/i);
        assert.equal(await fs.promises.readFile(target,'utf8'),'original');
        await assert.rejects(install({url:'https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-v1.0.34/launcher.AppImage',kind:'appimage',version:'1.0.34',sha256:'0'.repeat(64),size:12}),/sha-256/i);
        assert.equal(await fs.promises.readFile(target,'utf8'),'original');
    }finally{await fs.promises.rm(root,{recursive:true,force:true});}
});

test('Linux updates stop an oversized response before writing beyond the manifest size',async()=>{
    const root=await fs.promises.mkdtemp(path.join(tmpdir(),'unbroken-updater-oversized-'));
    const target=path.join(root,'launcher.AppImage');
    const source=ts.transpileModule(fs.readFileSync('src/main/linux-updater.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const module={exports:{}};
    let nextCalls=0,returnCalled=false;
    const body={
        [Symbol.asyncIterator]:()=>({
            next:async()=>{
                nextCalls++;
                if(nextCalls===1)return {done:false,value:Buffer.from('0123456789')};
                if(nextCalls===2)return {done:false,value:Buffer.from('extra')};
                return {done:true,value:undefined};
            },
            return:async()=>{returnCalled=true;return {done:true,value:undefined};}
        })
    } as AsyncIterable<Uint8Array>;
    const requireMock=(name:string):unknown=>name==='electron'?{app:{getPath:()=>root,relaunch:()=>{}}}
        :name==='node:fs'?{...fs,promises:{...fs.promises}}
        :name==='./launch'?{launcherRelaunchOptions:()=>({})}:require(name);
    const update={url:'https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-v1.0.34/launcher.AppImage',kind:'appimage',version:'1.0.34',sha256:sha256('0123456789extra'),size:10};
    const fetch=async()=>({ok:true,status:200,url:update.url,body});
    runInNewContext(source,{exports:module.exports,module,require:requireMock,process:{env:{APPIMAGE:target}},Buffer,fetch,AbortSignal});
    const install=(module.exports as {installLinuxUpdate:(u:unknown)=>Promise<string>}).installLinuxUpdate;
    try{
        await fs.promises.writeFile(target,'original');
        await assert.rejects(install(update),/update size mismatch/i);
        assert.equal(returnCalled,true);
        assert.equal(await fs.promises.readFile(target,'utf8'),'original');
        assert.deepEqual(await fs.promises.readdir(root),['launcher.AppImage']);
    }finally{await fs.promises.rm(root,{recursive:true,force:true});}
});

test('Linux updates reject an oversized Content-Length before reading the response body',async()=>{
    const root=await fs.promises.mkdtemp(path.join(tmpdir(),'unbroken-updater-content-length-'));
    const target=path.join(root,'launcher.AppImage');
    const source=ts.transpileModule(fs.readFileSync('src/main/linux-updater.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const module={exports:{}};
    const body={
        [Symbol.asyncIterator]:()=>({
            next:async()=>{throw new Error('response body should not be read');}
        })
    } as AsyncIterable<Uint8Array>;
    const update={url:'https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-v1.0.34/launcher.AppImage',kind:'appimage',version:'1.0.34',sha256:sha256('small'),size:5};
    const requireMock=(name:string):unknown=>name==='electron'?{app:{getPath:()=>root,relaunch:()=>{}}}
        :name==='node:fs'?{...fs,promises:{...fs.promises}}
        :name==='./launch'?{launcherRelaunchOptions:()=>({})}:require(name);
    const fetch=async()=>({ok:true,status:200,url:update.url,headers:{get:(name:string)=>name.toLowerCase()==='content-length'?'6':null},body});
    runInNewContext(source,{exports:module.exports,module,require:requireMock,process:{env:{APPIMAGE:target}},Buffer,fetch,AbortSignal});
    const install=(module.exports as {installLinuxUpdate:(u:unknown)=>Promise<string>}).installLinuxUpdate;
    try{
        await fs.promises.writeFile(target,'original');
        await assert.rejects(install(update),/update size mismatch/i);
        assert.equal(await fs.promises.readFile(target,'utf8'),'original');
        assert.deepEqual(await fs.promises.readdir(root),['launcher.AppImage']);
    }finally{await fs.promises.rm(root,{recursive:true,force:true});}
});

test('Linux update downloads use a bounded abort signal',async()=>{
    const root=await fs.promises.mkdtemp(path.join(tmpdir(),'unbroken-updater-timeout-'));
    const target=path.join(root,'launcher.AppImage');
    const source=ts.transpileModule(fs.readFileSync('src/main/linux-updater.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const module={exports:{}};
    const options:RequestInit[]=[];
    const requireMock=(name:string):unknown=>name==='electron'?{app:{getPath:()=>root,relaunch:()=>{}}}
        :name==='node:fs'?{...fs,promises:{...fs.promises}}
        :name==='./launch'?{launcherRelaunchOptions:()=>({})}:require(name);
    const fetch=async(_url:string,init?:RequestInit)=>{options.push(init??{});return new Response('small');};
    runInNewContext(source,{exports:module.exports,module,require:requireMock,process:{env:{APPIMAGE:target}},Buffer,fetch,Response,AbortSignal});
    const install=(module.exports as {installLinuxUpdate:(u:unknown)=>Promise<string>}).installLinuxUpdate;
    try{
        await fs.promises.writeFile(target,'original');
        const update={url:'https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-v1.0.34/launcher.AppImage',kind:'appimage',version:'1.0.34',sha256:sha256('small'),size:5};
        assert.equal(await install(update),'relaunch');
        assert.ok(options[0]?.signal,'update downloads must have a timeout signal');
        assert.equal((options[0]?.signal as AbortSignal).aborted,false);
    }finally{await fs.promises.rm(root,{recursive:true,force:true});}
});

test('Linux release discovery binds the selected artifact to its published checksum',async()=>{
    const root=await fs.promises.mkdtemp(path.join(tmpdir(),'unbroken-updater-discovery-'));
    const source=ts.transpileModule(fs.readFileSync('src/main/linux-updater.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const module={exports:{}};
    const name='DauntlessUnbrokenLauncher-1.0.57-linux-x86_64.AppImage';
    const body='new AppImage';
    const calls:string[]=[];
    const options: RequestInit[] = [];
    const requireMock=(value:string):unknown=>value==='electron'?{app:{getPath:()=>root,getVersion:()=> '1.0.56'}}
        :value==='node:fs'?{...fs,promises:{...fs.promises}}
        :value==='node:child_process'?{}:value==='./launch'?{}:require(value);
    const release={tag_name:'launcher-v1.0.57',assets:[
        {name,browser_download_url:`https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-v1.0.57/${name}`,size:Buffer.byteLength(body)},
        {name:'SHA256SUMS-LINUX.txt',browser_download_url:'https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-v1.0.57/SHA256SUMS-LINUX.txt',size:100}
    ]};
    const fetch=async(url:string, init?: RequestInit)=>{calls.push(url);options.push(init ?? {});return calls.length===1?new Response(JSON.stringify(release),{headers:{'content-type':'application/json'}}):new Response(`${sha256(body)}  ${name}\n`);};
    runInNewContext(source,{exports:module.exports,module,require:requireMock,process:{env:{APPIMAGE:path.join(root,'launcher.AppImage')}},Buffer,fetch,Response,AbortSignal});
    const find=(module.exports as {findLinuxUpdate:()=>Promise<unknown>}).findLinuxUpdate;
    try{
        assert.deepEqual(JSON.parse(JSON.stringify(await find())),{url:`https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-v1.0.57/${name}`,kind:'appimage',version:'1.0.57',sha256:sha256(body),size:Buffer.byteLength(body)});
        assert.deepEqual(calls,['https://api.github.com/repos/Vvoidddd/dauntless-unbroken/releases/latest','https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-v1.0.57/SHA256SUMS-LINUX.txt']);
        assert.ok(options[1]?.signal, 'checksum discovery must have a timeout signal');
    }finally{await fs.promises.rm(root,{recursive:true,force:true});}
});

test('Linux release discovery refuses untrusted release asset URLs',async()=>{
    const root=await fs.promises.mkdtemp(path.join(tmpdir(),'unbroken-updater-trust-'));
    const source=ts.transpileModule(fs.readFileSync('src/main/linux-updater.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const module={exports:{}};
    const name='DauntlessUnbrokenLauncher-1.0.57-linux-x86_64.AppImage';
    const release={tag_name:'launcher-v1.0.57',assets:[
        {name,browser_download_url:'https://updates.example.test/'+name,size:12},
        {name:'SHA256SUMS-LINUX.txt',browser_download_url:'https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-v1.0.57/SHA256SUMS-LINUX.txt',size:100}
    ]};
    const requireMock=(value:string):unknown=>value==='electron'?{app:{getVersion:()=> '1.0.56'}}:value==='./launch'?{}:require(value);
    const calls:string[]=[];
    const fetch=async(url:string)=>{calls.push(url);return url.includes('/releases/latest')?new Response(JSON.stringify(release)):new Response(`${sha256('new AppImage')}  ${name}\n`);};
    runInNewContext(source,{exports:module.exports,module,require:requireMock,process:{env:{APPIMAGE:path.join(root,'launcher.AppImage')}},Buffer,fetch,Response,AbortSignal});
    const find=(module.exports as {findLinuxUpdate:()=>Promise<unknown>}).findLinuxUpdate;
    assert.equal(await find(),null);
    assert.deepEqual(calls,['https://api.github.com/repos/Vvoidddd/dauntless-unbroken/releases/latest']);
    await fs.promises.rm(root,{recursive:true,force:true});
});

test('Linux release discovery refuses release metadata from a non-GitHub API host',async()=>{
    const root=await fs.promises.mkdtemp(path.join(tmpdir(),'unbroken-updater-api-trust-'));
    const source=ts.transpileModule(fs.readFileSync('src/main/linux-updater.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const module={exports:{}};
    const requireMock=(value:string):unknown=>value==='electron'?{app:{getVersion:()=> '1.0.56'}}:value==='./launch'?{}:require(value);
    const fetch=async()=>({ok:true,status:200,url:'https://updates.example.test/releases/latest',json:async()=>({})}) as unknown as Response;
    runInNewContext(source,{exports:module.exports,module,require:requireMock,process:{env:{APPIMAGE:path.join(root,'launcher.AppImage')}},Buffer,fetch,AbortSignal});
    const find=(module.exports as {findLinuxUpdate:()=>Promise<unknown>}).findLinuxUpdate;
    await assert.rejects(find(),/GitHub release metadata used an insecure URL/);
    await fs.promises.rm(root,{recursive:true,force:true});
});

test('Linux package updates pass paths as arguments to pkexec without a shell',async()=>{
    const root=await fs.promises.mkdtemp(path.join(tmpdir(),'updater-$()-'));
    const source=ts.transpileModule(fs.readFileSync('src/main/linux-updater.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const calls:Array<{program:string,args:string[]}>=[];
    const module={exports:{}};
    const requireMock=(name:string):unknown=>name==='electron'?{app:{getPath:()=>root}}
        :name==='node:child_process'?{spawn:(program:string,args:string[])=>{calls.push({program,args});const child=new EventEmitter() as EventEmitter & {unref:()=>void};child.unref=()=>{};queueMicrotask(()=>{child.emit('spawn');child.emit('exit',0,null);});return child;}}
        :name==='./launch'?{}:require(name);
    runInNewContext(source,{exports:module.exports,module,require:requireMock,process:{env:{}},Buffer,fetch:async()=>new Response('package'),AbortSignal});
    const install=(module.exports as {installLinuxUpdate:(u:unknown)=>Promise<string>}).installLinuxUpdate;
    try {
        for(const kind of ['deb','rpm']){
            assert.equal(await install({url:'https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-v1.2.3/package',kind,version:'1.2.3',sha256:sha256('package'),size:7}),'quit');
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
    runInNewContext(source,{exports:module.exports,module,require:requireMock,process:{env:{}},Buffer,fetch:async()=>new Response('package'),AbortSignal});
    const install=(module.exports as {installLinuxUpdate:(u:unknown)=>Promise<string>}).installLinuxUpdate;
    try {
        await assert.rejects(install({url:'https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-v1.2.3/package',kind:'deb',version:'1.2.3',sha256:sha256('package'),size:7}),/pkexec missing/);
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
    runInNewContext(source,{exports:module.exports,module,require:requireMock,process:{env:{}},Buffer,fetch:async()=>new Response('package'),AbortSignal});
    const install=(module.exports as {installLinuxUpdate:(u:unknown)=>Promise<string>}).installLinuxUpdate;
    try {
        const pending=install({url:'https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-v1.2.3/package',kind:'deb',version:'1.2.3',sha256:sha256('package'),size:7});
        let settled=false; void pending.then(()=>{settled=true;},()=>{settled=true;});
        await new Promise(resolve=>setTimeout(resolve,50));
        assert.equal(settled,false);
        child!.emit('exit',126,null);
        await assert.rejects(pending,/installer.*126/i);
        assert.deepEqual(await fs.promises.readdir(root),[]);
    } finally {await fs.promises.rm(root,{recursive:true,force:true});}
});
