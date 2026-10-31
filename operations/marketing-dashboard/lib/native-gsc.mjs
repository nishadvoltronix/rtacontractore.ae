import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {basename} from 'node:path';
import {validDay,shiftDay,SITE_HOST} from './model.mjs';

const ALLOWED=new Set(['Chart.csv','Filters.csv','Pages.csv','Queries.csv']);
const requireValue=(value,message)=>{if(!value)throw new Error(message);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function crc32(bytes) {let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}

// Read only the four reviewed entries in memory. Nothing is extracted to disk.
export function readNativeZip(bytes,expectedSha256) {
  requireValue(Buffer.isBuffer(bytes)&&bytes.length>=22&&bytes.length<=10_000_000,'Invalid or oversized native export ZIP');
  requireValue(/^[a-f0-9]{64}$/i.test(expectedSha256??'')&&sha(bytes)===expectedSha256.toLowerCase(),'Native export SHA256 mismatch');
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
  requireValue(end>=0,'Missing ZIP directory');
  const count=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16),size=bytes.readUInt32LE(end+12);
  requireValue(bytes.readUInt16LE(end+4)===0&&bytes.readUInt16LE(end+6)===0&&count===bytes.readUInt16LE(end+8)&&count<=40&&count!==65535&&offset+size===end,'Unsupported ZIP layout');
  const files={},hashes={},seen=new Set();let cursor=offset,total=0;
  for(let i=0;i<count;i++){
    requireValue(cursor+46<=end&&bytes.readUInt32LE(cursor)===0x02014b50,'Invalid ZIP directory entry');
    const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),crc=bytes.readUInt32LE(cursor+16),compressed=bytes.readUInt32LE(cursor+20),uncompressed=bytes.readUInt32LE(cursor+24);
    const nl=bytes.readUInt16LE(cursor+28),el=bytes.readUInt16LE(cursor+30),cl=bytes.readUInt16LE(cursor+32),local=bytes.readUInt32LE(cursor+42);
    requireValue(cursor+46+nl+el+cl<=end,'Truncated ZIP entry');
    const name=bytes.subarray(cursor+46,cursor+46+nl).toString('utf8');cursor+=46+nl+el+cl;
    requireValue(!seen.has(name)&&!name.includes('/')&&!name.includes('\\')&&!name.includes('\0'),'Unsafe or duplicate ZIP entry');seen.add(name);
    if(!ALLOWED.has(name))continue;
    requireValue(!(flags&1)&&[0,8].includes(method)&&uncompressed<=1_000_000&&local+30<=offset&&bytes.readUInt32LE(local)===0x04034b50,'Unsupported or oversized reviewed ZIP entry');
    const localNameLength=bytes.readUInt16LE(local+26),localExtraLength=bytes.readUInt16LE(local+28),start=local+30+localNameLength+localExtraLength;
    requireValue(start+compressed<=offset&&bytes.subarray(local+30,local+30+localNameLength).toString('utf8')===name&&bytes.readUInt16LE(local+8)===method,'ZIP local-entry mismatch');
    const packed=bytes.subarray(start,start+compressed),raw=method===0?Buffer.from(packed):inflateRawSync(packed,{maxOutputLength:1_000_000});
    requireValue(raw.length===uncompressed&&crc32(raw)===crc,'ZIP entry integrity mismatch');total+=raw.length;requireValue(total<=2_000_000,'Reviewed ZIP entries exceed size limit');
    const text=raw.toString('utf8');requireValue(!text.includes('\ufffd'),'Invalid UTF-8 native export');files[name]=text;hashes[name]=sha(raw);
  }
  requireValue(cursor===end&&[...ALLOWED].every(name=>Object.hasOwn(files,name)),'Native export is missing a required reviewed CSV');
  return {files,hashes,archiveSha256:sha(bytes)};
}
export function parseCSV(text) {
  requireValue(typeof text==='string'&&text.length<=1_000_000,'Invalid CSV input');
  const rows=[];let row=[],field='',quoted=false,closed=false;
  const input=text.replace(/^\ufeff/,'');
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(quoted){if(c==='"'){if(input[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c==='"'){requireValue(field===''&&!closed,'Malformed CSV quoting');quoted=true;}
    else if(c===','){row.push(field);field='';closed=false;}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';closed=false;}
    else {requireValue(!closed,'Malformed CSV after closing quote');field+=c;}
  }
  requireValue(!quoted,'Unterminated CSV quote');
  if(field!==''||row.length||closed){row.push(field);rows.push(row);}
  requireValue(rows.length>0&&rows.every(r=>r.length===rows[0].length),'CSV columns are inconsistent');
  return rows;
}
function csvRows(text,header) {const rows=parseCSV(text);requireValue(JSON.stringify(rows.shift())===JSON.stringify(header),'Unexpected native CSV columns');return rows;}
function count(value) {requireValue(/^\d+$/.test(value),'Invalid native count');const n=Number(value);requireValue(Number.isSafeInteger(n),'Unsafe native count');return n;}
function ratio(value) {if(value==='')return null;requireValue(/^\d+(?:\.\d+)?%$/.test(value),'Invalid native CTR');const n=Number(value.slice(0,-1))/100;requireValue(n>=0&&n<=1,'Native CTR outside valid bounds');return n;}
function position(value) {if(value==='')return null;requireValue(/^\d+(?:\.\d+)?$/.test(value)&&Number(value)>=1,'Invalid native position');return Number(value);}
function record(values) {const clicks=count(values[0]),impressions=count(values[1]),ctr=ratio(values[2]),averagePosition=position(values[3]);requireValue(impressions>=clicks,'Native clicks exceed impressions');requireValue(impressions>0||(ctr===null&&averagePosition===null),'Zero-impression rows must retain unavailable rates and positions');return {clicks,impressions,ctr,position:averagePosition};}
function exportedDateLabel(range) {const f=d=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T00:00:00Z'));return `${f(range.startDate)}-${f(range.endDate)}`;}
function publicPage(value) {let u;try{u=new URL(value);}catch{throw new Error('Invalid native public page URL');}requireValue(u.origin==='https://rtacontractor.ae'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/(?:[a-z0-9-]+\/)*$/.test(u.pathname),'Native page is outside the strict public URL contract');return u.href;}
export function normalizeNativeGSC(archive,scope) {
  requireValue(scope?.schemaVersion===1&&scope.acquisition==='native_authenticated_browser_csv_export'&&scope.propertyVerifiedInUI===true&&scope.property==='https://rtacontractor.ae/','Native GSC property must be verified in the authenticated UI');
  requireValue(scope.searchType==='Web (text-based)'&&scope.granularity==='Daily'&&Array.isArray(scope.additionalFilters)&&scope.additionalFilters.length===0,'Unsupported native GSC search scope');
  const range=scope.range;requireValue(validDay(range?.startDate)&&validDay(range?.endDate)&&range.startDate<=range.endDate&&(Date.parse(range.endDate)-Date.parse(range.startDate))/86400000<367,'Invalid native GSC date range');
  requireValue(validDay(scope.observedExportDate),'Native export observation date is required');
  const filters=csvRows(archive.files['Filters.csv'],['Filter','Value']);
  requireValue(filters.length===2&&filters[0][0]==='Search type'&&filters[0][1]===scope.searchType&&filters[1][0]==='Date'&&filters[1][1]===exportedDateLabel(range),'Native CSV filters do not match the observed UI scope');
  const daily=csvRows(archive.files['Chart.csv'],['Date','Clicks','Impressions','CTR','Position']).map(([date,...values])=>{requireValue(validDay(date)&&date>=range.startDate&&date<=range.endDate,'Native chart date outside scope');return {date,...record(values)};});
  const expected=[];for(let d=range.startDate;d<=range.endDate;d=shiftDay(d,1))expected.push(d);
  requireValue(daily.length===expected.length&&daily.every((row,i)=>row.date===expected[i]),'Native snapshot is missing dates, duplicated or not in daily order');
  const pages=csvRows(archive.files['Pages.csv'],['Top pages','Clicks','Impressions','CTR','Position']).map(([page,...values])=>({page:publicPage(page),...range,...record(values)}));
  requireValue(new Set(pages.map(r=>r.page)).size===pages.length,'Duplicate native search-result page');
  const queries=csvRows(archive.files['Queries.csv'],['Top queries','Clicks','Impressions','CTR','Position']);
  requireValue(queries.length===0,'Nonempty query exports require a separate privacy-reviewed import contract');
  const archiveName=basename(scope.archiveFileName??'');requireValue(/^[a-zA-Z0-9._-]+\.zip$/.test(archiveName),'Invalid source archive name');
  const source={provider:'Google Search Console',classification:'native authenticated browser CSV export',status:'observed snapshot',timezone:'America/Los_Angeles',property:'https://rtacontractor.ae/',searchType:scope.searchType,
    observedExportDate:scope.observedExportDate,importedAt:new Date().toISOString(),dataFinalization:'not established; snapshot may be revised',activeForMetrics:true,
    acquisition:{kind:'native_browser_csv',propertyIdentityBasis:'Authenticated UI observation; property identity is not encoded in Filters.csv',granularity:'Daily',additionalFilters:[]},
    coverage:{...range,status:'complete',basis:'Every requested day is present in the exported chart snapshot; this does not establish finalization'},
    files:[archiveName,...ALLOWED],fileHashes:{[archiveName]:archive.archiveSha256,...archive.hashes},
    description:'Native Web (text-based) export snapshot. Reported date rows are preserved, including observed zeros. Blank CTR and position remain unavailable; data may be revised.',
    metricDefinitions:[{label:'Organic search clicks',definition:'Clicks reported for the selected covered dates in Chart.csv, Web (text-based), exact verified URL-prefix property.'},{label:'Organic search impressions',definition:'Impressions reported for the selected covered dates in Chart.csv. Missing dates are never filled with zeros.'},{label:'CTR and average position',definition:'Native exported values. Empty cells are unavailable, not zero. Positions are not averaged across zero-impression days.'}],
    evidenceFlow:[{title:'Authenticated native export',detail:`Verified property ${scope.property}; Performance → Custom ${range.startDate} through ${range.endDate}; Search type ${scope.searchType}; no other filters; Daily granularity; Export → Download CSV. Observed ${scope.observedExportDate}. No API request or SQL was executed.`},
      {title:'Archive and scope verification',detail:`SHA256 ${archive.archiveSha256}. Filters.csv must exactly match the UI search type and selected dates. Only Chart.csv, Filters.csv, Pages.csv and header-only Queries.csv are read; other entries are ignored.`},
      {title:'Transformation',detail:'Parse RFC-style CSV; require exact headers and one ordered row for every selected date; retain integer clicks/impressions and null blank rates/positions. Sum only additive daily clicks/impressions for a fully covered selection. Keep page rows at the full-export period and separate from Analytics sessions.'}],
  };
  const totals={hostname:SITE_HOST,...range,clicks:daily.reduce((sum,r)=>sum+r.clicks,0),impressions:daily.reduce((sum,r)=>sum+r.impressions,0)};
  return {gsc_native_daily:{rows:daily,source},gsc_period_totals:{rows:[totals],source},
    gsc_pages:{rows:pages,source:{...source,description:'Search result pages from Pages.csv for the full native export period. These are Search Console impressions/clicks, not GA4 landing-page sessions.'}},
    gsc_queries:{rows:[],source:{...source,emptyResultObserved:true,description:'Queries.csv contains headers only for this snapshot. No query counts or keywords are inferred; Search Console may withhold query details.'}}};
}
