import {promises as fs} from 'node:fs';
import path from 'node:path';

// Only the explicitly configured common folders, no recursive disk scan. The
// renderer receives filenames; key contents stay in the existing import path.
export async function findBackupFiles(folders: string[]): Promise<string[]> {
  const files:string[]=[];
  for (const folder of new Set(folders)) {
    try {
      const dir=await fs.opendir(folder);
      let visited=0;
      for await (const entry of dir) {
        if (++visited > 1000 || files.length >= 100) break;
        if (entry.isFile() && /\.txt$/i.test(entry.name)) {
          const file=path.join(folder,entry.name), stat=await fs.stat(file).catch(()=>null);
          if (stat && stat.size > 0 && stat.size <= 8192) files.push(file);
        }
      }
    } catch { /* Missing or inaccessible common folder. */ }
  }
  return files.sort((a,b)=>path.basename(a).localeCompare(path.basename(b)));
}
