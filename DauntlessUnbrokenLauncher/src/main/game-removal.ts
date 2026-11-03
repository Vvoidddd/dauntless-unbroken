import {promises as fs} from 'node:fs';
import path from 'node:path';
import {resolveInside, type GameManifest} from './manifest';

// Remove only game content named by the compiled manifest. Keep Archon/Saved,
// unrelated files in shared install folders, launcher profiles and account backups.
export async function gameRemovalTargets(root:string,manifest:GameManifest,protectedPaths:string[]):Promise<string[]> {
  const resolved=path.resolve(root);
  if(resolved===path.parse(resolved).root)throw Error('Refusing a filesystem root');
  const rootStat=await fs.lstat(resolved).catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return null;throw error;});
  if(!rootStat)return [];
  if(rootStat.isSymbolicLink())throw Error('Refusing linked game content');
  // Windows TEMP may use an 8.3 parent alias; canonicalize the selected root
  // before comparing its children, while still refusing linked content targets.
  const base=await fs.realpath(resolved);
  type Tree = { file: boolean; children: Map<string, Tree> };
  const tree: Tree = {file:false,children:new Map()};
  const key = (name:string) => process.platform === 'win32' ? name.toLowerCase() : name;
  for (const file of manifest.files) {
    resolveInside(base,file.path);
    const parts=file.path.split('/');
    if(parts[0]==='Archon' && parts[1]==='Saved')continue;
    let node=tree;
    for(const part of parts){
      const name=key(part);
      let child=node.children.get(name);
      if(!child){child={file:false,children:new Map()};node.children.set(name,child);}
      node=child;
    }
    node.file=true;
  }
  const targets:string[]=[];
  async function select(dir:string,node:Tree,isArchon=false):Promise<{paths:string[];whole:boolean}> {
    const stat=await fs.lstat(dir).catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return null;throw error;});
    if(!stat)return {paths:[],whole:true};
    if(stat.isSymbolicLink())throw Error('Refusing linked game content');
    const real=await fs.realpath(dir);
    if(path.relative(dir,real)!=='')throw Error('Refusing linked game content');
    if(node.file){
      if(!stat.isFile()||node.children.size)throw Error('Game content changed');
      return {paths:[real],whole:true};
    }
    if(!stat.isDirectory())throw Error('Game content changed');
    const entries=await fs.readdir(dir,{withFileTypes:true});
    const actual=new Map(entries.map(entry=>[key(entry.name),entry.name]));
    let whole=entries.every(entry=>node.children.has(key(entry.name)));
    const paths:string[]=[];
    for(const [name,child] of node.children){
      const actualName=actual.get(name);
      if(actualName===undefined)continue;
      const selected=await select(path.join(dir,actualName),child);
      paths.push(...selected.paths);whole &&= selected.whole;
    }
    if(whole && paths.length && !isArchon)return {paths:[real],whole:true};
    return {paths,whole:false};
  }
  const rootEntries=await fs.readdir(base);
  for(const [name,node] of tree.children){
    const actual=rootEntries.find(entry=>key(entry)===name);
    if(actual===undefined)continue;
    const selected=await select(path.join(base,actual),node,name===key('Archon'));
    targets.push(...selected.paths);
  }
  for(const target of targets){
    for(const protectedPath of protectedPaths){
      const protectedReal=await fs.realpath(protectedPath).catch(()=>path.resolve(protectedPath));
      const overlaps=(a:string,b:string)=>{const rel=path.relative(a,b);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
      if(overlaps(target,protectedReal)||overlaps(protectedReal,target))throw Error('Game content overlaps protected launcher data');
    }
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
