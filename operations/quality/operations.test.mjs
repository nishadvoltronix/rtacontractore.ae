import test from 'node:test';
import assert from 'node:assert/strict';
import { monitorPublic } from './monitor-public.mjs';
import { buildSubmission,submitIndexNow } from '../search/indexnow.mjs';
const fixtureKey='a'.repeat(32);
test('IndexNow refuses off-site, credential-bearing, query-bearing and noncanonical URLs',()=>{
  for(const route of ['https://other.invalid/','https://fixture-user:fixture-password@rtacontractor.ae/','/contact/?email=test','/contact/#name','/contact']) assert.throws(()=>buildSubmission(fixtureKey,[route]));
  assert.equal(buildSubmission(fixtureKey,['/','/contact/','/contact/']).urlList.length,2);
});
test('IndexNow sends no POST when live ownership proof is missing or wrong',async()=>{
  for(const response of [new Response('missing',{status:404}),new Response('b'.repeat(32))]) {
    const calls=[];
    await assert.rejects(submitIndexNow(fixtureKey,async(url,options)=>{calls.push({url,options});return response;}));
    assert.equal(calls.length,1);
    assert.equal(calls[0].options.method,undefined);
  }
});
test('IndexNow cancels oversized streamed ownership proof even when Content-Length is false',async()=>{
  let chunksProduced=0; let cancelled=false; const calls=[];
  const stream=new ReadableStream({
    pull(controller) {chunksProduced++;controller.enqueue(new Uint8Array(65));},
    cancel() {cancelled=true;},
  });
  const proof=new Response(stream,{headers:{'Content-Length':'1'}});
  await assert.rejects(submitIndexNow(fixtureKey,async(url,options)=>{calls.push({url,options});return proof;}),/byte limit/);
  assert.equal(calls.length,1);assert.equal(cancelled,true);assert(chunksProduced<=4);
});
test('IndexNow distinguishes acceptance from pending verification and indexing',async()=>{
  const calls=[];
  const result=await submitIndexNow(fixtureKey,async(url,options)=>{calls.push({url,options}); return calls.length===1?new Response(fixtureKey):new Response('',{status:202});});
  assert.equal(calls[1].options.method,'POST');
  assert.equal(result.received,true);assert.equal(result.keyValidationPending,true);assert.equal(result.indexingGuaranteed,false);
});
test('Public monitor flags HTTPS downgrade and never follows it or submits a form',async()=>{
  const calls=[];
  const result=await monitorPublic(async(url,options)=>{calls.push(options);return url.endsWith('street-lighting')?new Response('',{status:301,headers:{location:'http://rtacontractor.ae:3100/services/street-lighting/'}}):new Response('ok');});
  assert.equal(result.healthy,false);assert.equal(result.checks.at(-1).canonicalRedirectSafe,false);
  assert.equal(result.notificationsSent,false);
  assert(calls.every(c=>c.redirect==='manual' && c.method===undefined));
});
