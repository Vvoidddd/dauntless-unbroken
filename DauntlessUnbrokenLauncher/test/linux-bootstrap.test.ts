import {test} from 'node:test';
import assert from 'node:assert/strict';
import {constants, promises as fs, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

test('Linux packaging wraps the fused binary once; Steam overlay is withheld only from Electron',async()=>{
    const tree=ts.createSourceFile('forge.config.ts',readFileSync('forge.config.ts','utf8'),ts.ScriptTarget.Latest,true);
    let hook:ts.Expression|undefined;
    const visit=(node:ts.Node)=>{
        if(ts.isPropertyAssignment(node)&&node.name.getText(tree)==='postPackage')hook=node.initializer;
        ts.forEachChild(node,visit);
    };visit(tree);assert.ok(hook);
    const postPackage=runInNewContext(ts.transpile(`(${hook.getText(tree)})`,{target:ts.ScriptTarget.ES2022}),{fs,fsConstants:constants,path});
    const root=await fs.mkdtemp(path.join(tmpdir(),'unbroken-bootstrap-'));
    const executable=path.join(root,'DauntlessUnbrokenLauncher');
    try{
        const program='#!/bin/sh\nprintf "%s\\n" "${LD_PRELOAD-unset}" "${DR_GAME_LD_PRELOAD-unset}" "${SteamAppId-unset}" "$@" > "$BOOTSTRAP_OUTPUT"\n';
        await fs.writeFile(executable,program,{mode:0o755});
        await postPackage(null,{platform:'win32',outputPaths:[root]});
        assert.equal(await fs.readFile(executable,'utf8'),program);
        await postPackage(null,{platform:'linux',outputPaths:[root]});
        assert.equal(await fs.readFile(executable+'.bin','utf8'),program);
        assert.equal(await fs.readFile(executable,'utf8'),readFileSync('scripts/linux-launcher.sh','utf8'));
        await assert.rejects(postPackage(null,{platform:'linux',outputPaths:[root]}),{code:'EEXIST'});
        assert.equal(await fs.readFile(executable+'.bin','utf8'),program);
        if(process.platform==='linux'){
            const link=path.join(root,'AppRun'),output=path.join(root,'environment.txt');
            await fs.symlink(executable,link);
            const preload='/steam/ubuntu12_32/gameoverlayrenderer.so:/keep/helper.so /steam/ubuntu12_64/gameoverlayrenderer.so';
            execFileSync(link,['argument with spaces','--safe-mode'],{env:{...process.env,LD_PRELOAD:preload,SteamAppId:'123',BOOTSTRAP_OUTPUT:output},stdio:'pipe'});
            assert.deepEqual((await fs.readFile(output,'utf8')).trimEnd().split('\n'),['/keep/helper.so',preload,'123','argument with spaces','--safe-mode']);
        }
    }finally{await fs.rm(root,{recursive:true,force:true});}
});
