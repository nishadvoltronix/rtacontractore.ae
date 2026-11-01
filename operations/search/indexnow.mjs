import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { indexableRoutes } from '../../website/page-content.mjs';

const origin='https://rtacontractor.ae';
const endpoint='https://api.indexnow.org/indexnow';
export function buildSubmission(key,routes=indexableRoutes) {
  if(!/^[a-f0-9]{32}$/i.test(key??'')) throw new Error('A valid owner-managed 32-character hexadecimal key is required.');
  const urlList=[...new Set(routes.map(route=>{
    const url=new URL(route,origin);
    if(url.origin!==origin || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/')) throw new Error('Only canonical public RTA page URLs may be submitted.');
    return url.href;
  }))];
  if(urlList.length===0 || urlList.length>10000) throw new Error('Invalid submission size.');
  return {host:'rtacontractor.ae',key,keyLocation:`${origin}/${key}.txt`,urlList};
}
async function readProof(response) {
  const reader=response.body?.getReader?.();
  if(!reader) throw new Error('Live ownership proof is unreadable.');
  const chunks=[]; let bytes=0; let complete=false;
  try {
    for (;;) {
      const {done,value}=await reader.read();
      if(done) {complete=true;break;}
      if(!(value instanceof Uint8Array)) throw new Error('Live ownership proof is unreadable.');
      bytes+=value.byteLength;
      if(bytes>128) throw new Error('Live ownership proof exceeds its byte limit.');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks,bytes).toString('utf8');
  } finally {
    if(!complete) {try {await reader.cancel();} catch { /* No body contents or provider error is exposed. */ }}
    reader.releaseLock();
  }
}
export async function submitIndexNow(key,fetcher=fetch) {
  const body=buildSubmission(key);
  const proof=await fetcher(body.keyLocation,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(proof.status!==200) {await proof.body?.cancel();throw new Error('Live ownership proof is unavailable.');}
  const text=await readProof(proof);
  if(text.trim()!==key) throw new Error('Live ownership proof does not match.');
  const response=await fetcher(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify(body)});
  await response.body?.cancel();
  return {urlCount:body.urlList.length,status:response.status,received:response.status===200||response.status===202,keyValidationPending:response.status===202,indexingGuaranteed:false};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const prepare=process.argv.indexOf('--prepare-key');
  if(prepare!==-1) {
    const destination=process.argv[prepare+1];
    if(!destination || !destination.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(destination)) throw new Error('An absolute private key-file path is required.');
    await writeFile(destination,randomBytes(16).toString('hex'),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({keyPrepared:true,overwritten:false,note:'Keep this file private; install the matching UTF-8 proof file only in the approved website release.'}));
  } else if(process.argv.includes('--submit')) {
    const keyFile=process.env.RTA_INDEXNOW_KEY_FILE;
    if(!keyFile) throw new Error('RTA_INDEXNOW_KEY_FILE is required.');
    const key=(await readFile(keyFile,'utf8')).trim();
    const result=await submitIndexNow(key);
    console.log(JSON.stringify(result,null,2));
    if(!result.received) process.exitCode=1;
  } else console.log(JSON.stringify({mode:'dry-run',website:origin,canonicalPageCount:indexableRoutes.length,submissionSent:false,requirements:['Owner-managed private key','Matching proof file deployed on HTTPS','Explicit --submit flag']},null,2));
}
