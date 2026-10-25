import {promises as fs} from 'node:fs';
import path from 'node:path';
import {resolveInside, type GameManifest} from './manifest';

// Remove only game content named by the compiled manifest. Keep Archon/Saved,
// unrelated files in shared install folders, launcher profiles and account backups.
export async function gameRemovalTargets(root:string,manifest:GameManifest,protectedPaths:string[]):Promise<string[]> {
  const base=path.resolve(root);
  if(base===path.parse(base).root)throw Error('Refusing a filesystem root');
  const names=new Set(manifest.files.map(file=>{
    resolveInside(base,file.path);
    const parts=file.path.split('/');
    return parts[0]==='Archon'?parts.slice(0,2).join('/'):parts[0];
  }));
  const targets:string[]=[];
  for(const name of names){
    if(name==='Archon'||name==='Archon/Saved')continue;
    const target=resolveInside(base,name);
    const stat=await fs.lstat(target).catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return null;throw error;});
    if(!stat)continue;
    const real=await fs.realpath(target);
    if(stat.isSymbolicLink()||path.relative(target,real)!=='')throw Error('Refusing linked game content');
    for(const protectedPath of protectedPaths){
      const protectedReal=await fs.realpath(protectedPath).catch(()=>path.resolve(protectedPath));
      const overlaps=(a:string,b:string)=>{const rel=path.relative(a,b);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
      if(overlaps(real,protectedReal)||overlaps(protectedReal,real))throw Error('Game content overlaps protected launcher data');
    }
    targets.push(target);
  }
  return targets;
}

export async function removeGameFiles(root:string,manifest:GameManifest,protectedPaths:string[],confirm:(targets:string[])=>Promise<boolean>,trash:(target:string)=>Promise<void>):Promise<boolean>{
  const targets=await gameRemovalTargets(root,manifest,protectedPaths);
  if(!targets.length||!await confirm(targets))return false;
  // A dialog can stay open while files change. Validate every target again before moving any.
  const current=await gameRemovalTargets(root,manifest,protectedPaths);
  if(JSON.stringify(current)!==JSON.stringify(targets))throw Error('Game content changed during confirmation');
  for(const target of targets)await trash(target);
  return true;
}
