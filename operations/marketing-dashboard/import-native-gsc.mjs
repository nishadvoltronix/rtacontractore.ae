import {readFile,writeFile,rename,unlink,stat} from 'node:fs/promises';
import {resolve,dirname,basename,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readNativeZip,normalizeNativeGSC} from './lib/native-gsc.mjs';
import {availableDays} from './lib/model.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const parse=value=>{try{return JSON.parse(value);}catch{throw new Error('Invalid private JSON; its contents are not logged');}};
export function importNativeSnapshot(snapshot,archive,scope) {
  if(!snapshot.id||snapshot.surface!=='dashboard'||!snapshot.queries?.metric_availability)throw new Error('Existing reviewed canonical dashboard required');
  const next=structuredClone(snapshot),queries=normalizeNativeGSC(archive,scope);
  Object.assign(next.queries,queries);
  if(next.queries.reporting_days)next.queries.reporting_days.rows=availableDays(next.queries).map(date=>({date}));
  const row=next.queries.source_readiness?.rows.find(r=>r.provider==='Search Console');
  if(row){row.status='Native export imported; API reporting pending';row.observation='An authenticated native Web (text-based) daily CSV snapshot is loaded for its observed dates. No API or native AI performance report was retrieved.';row.nextAction='Review the native snapshot and obtain a fresh export or authorized reporting connection when needed.';}
  for(const metric of next.queries.metric_availability.rows.filter(m=>['searchClicks','searchImpressions'].includes(m.id)))metric.reason='Selected dates are outside the available native Search Console snapshot';
  next.buildStatus='updating';next.generatedAt=new Date().toISOString();
  return next;
}
async function main() {
  const args={};for(let i=2;i<process.argv.length;i+=2){const k=process.argv[i];if(!['--zip','--scope','--expected-sha256','--snapshot'].includes(k)||!process.argv[i+1]||args[k])throw new Error('Invalid arguments');args[k]=process.argv[i+1];}
  if(Object.keys(args).length!==4)throw new Error('Usage: node import-native-gsc.mjs --zip PRIVATE_ZIP --scope PRIVATE_UI_SCOPE_JSON --expected-sha256 PINNED_SHA256 --snapshot PRIVATE_APP/src/data.json');
  const zip=resolve(args['--zip']),scopePath=resolve(args['--scope']),target=resolve(args['--snapshot']);
  if((await stat(zip)).size>10_000_000||(await stat(scopePath)).size>30_000)throw new Error('Private input exceeds size limit');
  const archive=readNativeZip(await readFile(zip),args['--expected-sha256']);
  const scope={...parse(await readFile(scopePath,'utf8')),archiveFileName:basename(zip)};
  const before=await readFile(target),snapshot=parse(before),next=importNativeSnapshot(snapshot,archive,scope);
  if(sha(await readFile(target))!==sha(before))throw new Error('Dashboard changed during import; no write performed');
  const temporary=join(dirname(target),`.rta-native-gsc-${randomUUID()}.tmp`);
  try{await writeFile(temporary,JSON.stringify(next,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temporary,target);}finally{await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  console.log(JSON.stringify({imported:true,method:'native_authenticated_browser_csv_export',dailyRows:next.queries.gsc_native_daily.rows.length,range:scope.range,archiveSha256:archive.archiveSha256,finalization:'not established',buildRequired:true,artifactId:next.id}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
