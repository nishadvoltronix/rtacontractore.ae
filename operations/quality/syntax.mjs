import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const files=[];
async function walk(directory) {
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    if (['node_modules','.git','artifacts','generated'].includes(entry.name)) continue;
    const full=path.join(directory,entry.name);
    if(entry.isDirectory()) await walk(full);
    else if(entry.isFile() && /\.(mjs|js)$/.test(entry.name)) files.push(full);
  }
}
for(const directory of ['website','server','operations']) await walk(path.join(root,directory));
for(const file of files) {
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0) { process.stderr.write(result.stderr || 'Syntax check failed'); process.exit(1); }
}
console.log(JSON.stringify({javascriptFilesParsed:files.length,passed:true}));
