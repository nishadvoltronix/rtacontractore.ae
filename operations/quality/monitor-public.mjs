import { pathToFileURL } from 'node:url';
const origin='https://rtacontractor.ae';
const paths=['/','/robots.txt','/sitemap.xml','/services/street-lighting/','/services/street-lighting'];
export async function monitorPublic(fetcher=fetch) {
  const checks=[];
  for(const path of paths) {
    const url=origin+path;
    try {
      const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'RTA-Readiness-Monitor/1.0'}});
      const location=response.headers.get('location');
      const isSlashRedirect=path.endsWith('street-lighting') && [301,308].includes(response.status);
      let redirectSafe=false;
      if(isSlashRedirect && location) {
        const resolved=new URL(location,url);
        redirectSafe=resolved.href===origin+'/services/street-lighting/';
      }
      const ok=isSlashRedirect?redirectSafe:response.status===200;
      checks.push({path,status:response.status,ok,...(isSlashRedirect?{canonicalRedirectSafe:redirectSafe}:{})});
      await response.body?.cancel();
    } catch(error) {
      checks.push({path,status:null,ok:false,error:error.name==='TimeoutError'?'timeout':'request_failed'});
    }
  }
  return {checkedAt:new Date().toISOString(),website:origin,mode:'public-read-only',checks,healthy:checks.every(c=>c.ok),notificationsSent:false};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(!process.argv.includes('--live')) console.log(JSON.stringify({mode:'configuration-only',website:origin,paths,notificationsEnabled:false}));
  else { const result=await monitorPublic(); console.log(JSON.stringify(result,null,2)); if(!result.healthy) process.exitCode=1; }
}
