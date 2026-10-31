import {readFile,writeFile,rename,unlink,stat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {normalizeEnvelope,mergeQuery,ga4Request,gscRequest,googleAdsQuery,validateRange} from './lib/providers.mjs';
import {availableDays} from './lib/model.mjs';
const ORIGIN='https://rtacontractor.ae';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function parseJSON(value,label) {try{return JSON.parse(value);}catch{throw new Error(`${label} is not valid JSON; its contents are not logged.`);}}
async function boundedJSON(response) {
  if(!response.ok)throw new Error(`Read-only reporting request failed (HTTP ${response.status}); response details are not logged.`);
  if(Number(response.headers.get('content-length')??0)>20_000_000)throw new Error('Provider response exceeds size limit');
  const reader=response.body.getReader(),parts=[];let length=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>20_000_000)throw new Error('Provider response exceeds size limit');parts.push(value);}}
  catch(error){await reader.cancel();throw error;}
  return parseJSON(Buffer.concat(parts).toString('utf8'),'Provider response');
}
export async function fetchReport(provider,config,range,{fetchImpl=fetch,environment=process.env}={}) {
  validateRange(range);
  if(config?.enabled!==true||config?.ownershipVerified!==true||config?.websiteOrigin!==ORIGIN)throw new Error('Verified RTA reporting binding is disabled or incomplete');
  if(!config.finalizedThroughDate||config.finalizedThroughDate<range.endDate)throw new Error('Finalized source coverage is not verified through the requested end date; no snapshot will be written');
  if(!['ga4','gsc','googleAds'].includes(provider))throw new Error('Live provider retrieval is disabled; use its reviewed export contract');
  const token=environment[config.accessTokenEnv];
  if(typeof token!=='string'||!token)throw new Error('Server-side access token is unavailable');
  let url,request;const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
  if(provider==='ga4') {
    if(!/^\d+$/.test(String(config.propertyId)))throw new Error('Verified GA4 property ID required');
    url=`https://analyticsdata.googleapis.com/v1beta/properties/${config.propertyId}:runReport`;request=ga4Request(range);
  } else if(provider==='gsc') {
    if(config.siteUrl!==ORIGIN+'/')throw new Error('Verified RTA Search Console URL-prefix property required');
    url=`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(config.siteUrl)}/searchAnalytics/query`;request=gscRequest(range);
  } else {
    if(!/^\d+$/.test(String(config.customerId))||!/^v\d{1,2}$/.test(config.apiVersion??''))throw new Error('Verified Ads customer and supported API version required');
    const developerToken=environment[config.developerTokenEnv];if(!developerToken)throw new Error('Server-side Ads developer token unavailable');
    headers['developer-token']=developerToken;
    if(config.loginCustomerId){if(!/^\d+$/.test(config.loginCustomerId))throw new Error('Invalid manager-account binding');headers['login-customer-id']=config.loginCustomerId;}
    url=`https://googleads.googleapis.com/${config.apiVersion}/customers/${config.customerId}/googleAds:searchStream`;request={query:googleAdsQuery(range,config.campaignId)};
  }
  let transport;
  try{transport=await fetchImpl(url,{method:'POST',headers,body:JSON.stringify(request),redirect:'error',signal:AbortSignal.timeout(30000)});}
  catch{throw new Error('Read-only reporting transport failed; credentials and request details are not logged.');}
  const response=await boundedJSON(transport);
  return {schemaVersion:1,provider,websiteOrigin:ORIGIN,obtainedBy:'api',obtainedAt:new Date().toISOString(),coverageVerified:true,range,request,response,...(provider==='googleAds'?{campaignId:config.campaignId}:{})};
}
export function applyEnvelope(snapshot,envelope) {
  const incoming=normalizeEnvelope(envelope);
  if(!snapshot.queries?.[incoming.queryId])throw new Error('Target dashboard query is not registered');
  const next=structuredClone(snapshot);
  next.queries[incoming.queryId]=mergeQuery(snapshot.queries[incoming.queryId],incoming);
  if(incoming.queryId==='gsc_period_totals'&&next.queries.gsc_native_daily)next.queries.gsc_native_daily.source.activeForMetrics=false;
  for(const [key,value] of Object.entries(incoming.additionalQueries??{})){if(!next.queries[key])throw new Error('Additional target query is not registered');next.queries[key]=value;}
  if(next.queries.reporting_days)next.queries.reporting_days.rows=availableDays(next.queries).map(date=>({date}));
  next.generatedAt=new Date().toISOString();next.buildStatus='updating';
  return next;
}
async function privateJSON(path) {if((await stat(path)).size>30_000_000)throw new Error('Input file exceeds size limit');return parseJSON(await readFile(path,'utf8'),'Private input');}
async function main() {
  const args={};
  for(let i=2;i<process.argv.length;i+=2){const name=process.argv[i];if(!['--snapshot','--input','--provider','--config','--start','--end'].includes(name)||!process.argv[i+1]||args[name])throw new Error('Invalid arguments');args[name]=process.argv[i+1];}
  if(!args['--snapshot'])throw new Error('Use --snapshot PATH and either --input PRIVATE_EXPORT or --provider ga4|gsc|googleAds --config PRIVATE_BINDING --start YYYY-MM-DD --end YYYY-MM-DD');
  if(Boolean(args['--input'])===Boolean(args['--provider']))throw new Error('Choose exactly one import or read-only provider request');
  const path=resolve(args['--snapshot']),original=await readFile(path),snapshot=parseJSON(original,'Dashboard snapshot');
  let envelope;
  if(args['--input'])envelope={...await privateJSON(resolve(args['--input'])),obtainedBy:'owner-export'};
  else {
    if(!args['--config'])throw new Error('Private verified binding file required');
    const bindings=await privateJSON(resolve(args['--config']));
    envelope=await fetchReport(args['--provider'],bindings[args['--provider']],{startDate:args['--start'],endDate:args['--end']});
  }
  const next=applyEnvelope(snapshot,envelope);
  if(hash(await readFile(path))!==hash(original))throw new Error('Dashboard snapshot changed during refresh; no write performed');
  const temporary=join(dirname(path),`.rta-refresh-${randomUUID()}.tmp`);
  try {await writeFile(temporary,JSON.stringify(next,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temporary,path);}
  finally {await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  console.log(JSON.stringify({updated:true,provider:envelope.provider,range:envelope.range,buildRequired:true,automaticRefreshConnected:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
