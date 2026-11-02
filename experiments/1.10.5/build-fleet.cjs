// Reuse the production allocator's tested admission and city-seat reservations.
const path=require('node:path'),fs=require('node:fs');
const repo=path.resolve(__dirname,'../..');
const ts=require(path.join(repo,'DauntlessUnbrokenLauncher/node_modules/typescript'));
const out=path.join(__dirname,'bin/fleet');fs.mkdirSync(out,{recursive:true});
for(const name of ['citypool','capacity','cpuadmission']){
  const source=fs.readFileSync(path.join(repo,`DauntlessUnbrokenDeployServer/src/controllers/${name}.ts`),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
  fs.writeFileSync(path.join(out,name+'.js'),compiled.outputText);
}
fs.writeFileSync(path.join(__dirname,'bin/fleet.cjs'),"module.exports={...require('./fleet/citypool'),...require('./fleet/capacity'),...require('./fleet/cpuadmission')};\n");
