import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { campaignPack, socialPack } from './pack.mjs';

const output = new URL('./generated/', import.meta.url);
const csv = rows => rows.map(row => row.map(v => '"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
const xml = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
for (const ad of campaignPack.searchAds) {
  assert(ad.headlines.length >= 3 && ad.headlines.length <= 15);
  assert(ad.descriptions.length >= 2 && ad.descriptions.length <= 4);
  for (const headline of ad.headlines) assert(headline.length <= 30, `Headline too long: ${headline}`);
  for (const description of ad.descriptions) assert(description.length <= 90, `Description too long: ${description}`);
  assert(ad.path1.length <= 15 && ad.path2.length <= 15);
}
for (const link of campaignPack.sitelinks) {
  assert(link.text.length <= 25 && link.line1.length <= 35 && link.line2.length <= 35);
}
assert(campaignPack.callouts.every(text => text.length <= 25));
assert(campaignPack.publicationApproved === false && socialPack.publicationApproved === false);
await mkdir(output, {recursive:true});
await writeFile(new URL('campaign-review.json',output),JSON.stringify(campaignPack,null,2)+'\n');
await writeFile(new URL('social-review.json',output),JSON.stringify(socialPack,null,2)+'\n');
await writeFile(new URL('keyword-review.csv',output),csv([
  ['Ad group','Keyword theme','Proposed match','Demand verified','Landing page','State'],
  ...campaignPack.adGroups.flatMap(group=>group.keywords.map(([keyword,match])=>[group.name,keyword,match,'No',new URL(group.landingPage,campaignPack.website).href,'Review draft'])),
]));
await writeFile(new URL('negative-keyword-review.csv',output),csv([
  ['Negative theme','State','Evidence'],...campaignPack.negativeKeywordReview.map(text=>[text,'Review draft','Scope-based starter; not observed search terms']),
]));
const trackedLink = (path,platform,index) => {
  const url=new URL(path,campaignPack.website);
  for (const [key,value] of Object.entries({utm_source:platform,utm_medium:'organic_social',utm_campaign:'rta_project_brief_nov2026',utm_content:`post_${String(index+1).padStart(2,'0')}`})) url.searchParams.set(key,value);
  return url.href;
};
await writeFile(new URL('content-calendar-review.csv',output),csv([
  ['Proposed date Dubai','Platform','Title','Draft copy','Tracked destination','State'],
  ...socialPack.plannedPosts.map(([date,platform,title,copy,path],index)=>[date,platform,title,copy,trackedLink(path,platform,index),'Unscheduled; ownership and publication approval pending']),
]));
const logo='data:image/png;base64,'+(await readFile(new URL('../../website/dist/assets/voltronix-logo-white.png',import.meta.url))).toString('base64');
const profiles=[
  {name:'company-profile',width:400,height:400,kind:'profile'},
  {name:'linkedin-company-cover',width:4200,height:700,kind:'cover'},
  {name:'youtube-banner',width:2560,height:1440,kind:'youtube'},
  {name:'project-brief-square',width:1080,height:1080,kind:'post'},
  {name:'project-brief-wide',width:1200,height:630,kind:'post'},
];
for (const profile of profiles) {
  const {name,width:w,height:h,kind}=profile;
  const scale=w/1200;
  const motif=`<g fill="none" stroke="#ffffff" stroke-opacity=".09" stroke-width="${3*scale}"><path d="M${w*.68} 0v${h}M${w*.87} 0v${h}M0 ${h*.66}h${w}"/><circle cx="${w*.82}" cy="${h*.42}" r="${h*.64}"/><path d="M${w*.59} ${h}L${w} 0"/></g>`;
  let content='';
  if(kind==='profile') content=`<image href="${logo}" x="30" y="168" width="340" height="64" preserveAspectRatio="xMidYMid meet"/><text x="200" y="263" text-anchor="middle" fill="#c6c7cc" font-size="14" letter-spacing="3">CONTRACTING LLC</text>`;
  else if(kind==='cover') content=`<image href="${logo}" x="360" y="115" width="950" height="177" preserveAspectRatio="xMinYMid meet"/><text x="1530" y="260" fill="#fff" font-size="105" font-weight="700">Road lighting. Clear scope.</text><text x="1530" y="400" fill="#d7d8dd" font-size="65">Dubai project enquiries  /  rtacontractor.ae</text><text x="1530" y="535" fill="#aeb0b8" font-size="43">Independent contracting company</text>`;
  else if(kind==='youtube') content=`<image href="${logo}" x="565" y="552" width="650" height="121" preserveAspectRatio="xMinYMid meet"/><text x="565" y="750" fill="#fff" font-size="63" font-weight="700">Road lighting. Clear scope.</text><text x="565" y="825" fill="#d7d8dd" font-size="40">Dubai project enquiries · rtacontractor.ae</text><text x="565" y="879" fill="#b2b4bc" font-size="28">Independent contracting company</text>`;
  else {
    const left=w*.085, top=h*.14, titleSize=kind==='post'&&w===1080?70:62;
    content=`<image href="${logo}" x="${left}" y="${top}" width="${w*.38}" height="${w*.071}" preserveAspectRatio="xMinYMid meet"/><text x="${left}" y="${h*.42}" fill="#fff" font-size="${titleSize}" font-weight="700">A clearer brief.</text><text x="${left}" y="${h*.42+titleSize*1.16}" fill="#fff" font-size="${titleSize}" font-weight="700">A defined scope.</text><text x="${left}" y="${h*.70}" fill="#d7d8dd" font-size="${w*.025}">Drawings · Quantities · Interfaces · Handover</text><text x="${left}" y="${h*.85}" fill="#fff" font-size="${w*.026}" font-weight="700">rtacontractor.ae</text><text x="${left}" y="${h*.91}" fill="#afb1b9" font-size="${w*.017}">Independent contracting company · Project scope subject to review</text>`;
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${xml('VOLTRONIX '+name)}</title><desc>Editable brand graphic using the existing company logo. No project photography, authority logos or approval claims.</desc><rect width="${w}" height="${h}" fill="#15171d"/><rect width="${w*.018}" height="${h}" fill="#e62835"/>${motif}<g font-family="Arial,Helvetica,sans-serif">${content}</g></svg>`;
  await writeFile(new URL(name+'.svg',output),svg);
}
await writeFile(new URL('asset-specifications.json',output),JSON.stringify({status:'review-draft',assets:profiles,sourceLogo:'Existing website VOLTRONIX white logo; unchanged',sources:['https://www.linkedin.com/help/linkedin/answer/a570368','https://support.google.com/youtube/answer/10456525'],note:'LinkedIn company cover and YouTube dimensions checked against official guidance on 2026-11-01. Square/wide post graphics are editable templates; confirm each destination crop. No social account changed.'},null,2)+'\n');
console.log(JSON.stringify({generated:true,adsValidated:campaignPack.searchAds.length,keywordThemes:campaignPack.adGroups.reduce((n,g)=>n+g.keywords.length,0),negativeThemes:campaignPack.negativeKeywordReview.length,draftPosts:socialPack.plannedPosts.length,brandAssets:profiles.length,externalChanges:false},null,2));
