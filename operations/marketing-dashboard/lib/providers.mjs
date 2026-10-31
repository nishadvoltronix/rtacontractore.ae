import {validDay,SITE_HOST} from './model.mjs';
export const DOCS={
  ga4:'https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport',
  gsc:'https://developers.google.com/webmaster-tools/v1/searchanalytics/query',
  googleAds:'https://developers.google.com/google-ads/api/docs/reporting/overview',
  microsoftAds:'https://learn.microsoft.com/en-us/advertising/reporting-service/reportrequest?view=bingads-13',
};
const ORIGIN='https://rtacontractor.ae';
const HOSTS=[SITE_HOST,`www.${SITE_HOST}`];
const requireValue=(condition,message)=>{if(!condition)throw new Error(message);};
const numeric=(v,{integer=false}={})=>{
  requireValue((typeof v==='number'||typeof v==='string')&&v!==''&&v!==null,'Missing numeric observation');
  const n=Number(v);requireValue(Number.isFinite(n)&&n>=0&&(!integer||Number.isSafeInteger(n)),'Invalid numeric observation');return n;
};
export function validateRange(range) {
  requireValue(validDay(range?.startDate)&&validDay(range?.endDate)&&range.startDate<=range.endDate,'Invalid reporting range');
  requireValue((Date.parse(range.endDate)-Date.parse(range.startDate))/86400000<367,'Reporting range exceeds 367 days');
  return {startDate:range.startDate,endDate:range.endDate};
}
function safeLabel(value,max=250) {
  requireValue(typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f<>]/.test(value),'Unsafe report label');
  requireValue(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value),'Personal contact value in report label');
  return value;
}
function source(provider,envelope,description) {
  const range=validateRange(envelope.range);
  requireValue(typeof envelope.obtainedAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(envelope.obtainedAt)&&!Number.isNaN(Date.parse(envelope.obtainedAt)),'Missing source acquisition time');
  requireValue(envelope.websiteOrigin===ORIGIN,'Wrong website origin');
  requireValue(envelope.coverageVerified===true,'Source coverage has not been reviewed');
  return {provider,classification:envelope.obtainedBy==='api'?'successful read-only API response':'owner-supplied provider export',
    checkedAt:envelope.obtainedAt,timezone:provider==='Search Console'?'America/Los_Angeles':'Asia/Dubai',
    coverage:{...range,status:'complete'},description,
    evidenceFlow:[{title:'Source acquisition',detail:`${envelope.obtainedBy==='api'?'Successful read-only request':'Owner-supplied export'} for ${ORIGIN}, ${range.startDate} through ${range.endDate}. Private account bindings and authentication remain outside this artifact.`},
      {title:'Normalization',detail:'Strict provider schema, website scope, dates, currency and completeness checks. Only aggregate allowed fields are retained; no contact payloads, visitor IDs or click IDs.'}],
  };
}
export function ga4Request(range) {
  return {dateRanges:[validateRange(range)],metrics:[{name:'totalUsers'},{name:'sessions'}],
    dimensionFilter:{filter:{fieldName:'hostName',inListFilter:{values:HOSTS,caseSensitive:false}}},limit:'1'};
}
export function gscRequest(range) {
  return {...validateRange(range),type:'web',aggregationType:'byProperty',dataState:'final',rowLimit:1};
}
export function googleAdsQuery(range,campaignId) {
  const r=validateRange(range);requireValue(/^\d+$/.test(String(campaignId)),'Verified campaign ID required');
  return `SELECT customer.currency_code, customer.time_zone, campaign.id, campaign.name, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.id = ${campaignId} AND segments.date BETWEEN '${r.startDate}' AND '${r.endDate}'`;
}
function assertRequest(actual,expected) {
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  requireValue(JSON.stringify(canonical(actual))===JSON.stringify(canonical(expected)),'Response request does not match the scoped report contract');
}
export function normalizeGA4(envelope) {
  assertRequest(envelope.request,ga4Request(envelope.range));
  const response=envelope.response,metadata=response?.metadata;
  requireValue(metadata?.timeZone==='Asia/Dubai','GA4 timezone must be verified as Asia/Dubai');
  requireValue(!metadata.subjectToThresholding&&!metadata.dataLossFromOtherRow&&!(metadata.samplingMetadatas?.length)&&!(metadata.dataTruncationReasons?.length)&&!(metadata.schemaRestrictionResponse?.activeMetricRestrictions?.length),'GA4 report is thresholded, sampled, truncated or restricted');
  const s=source('GA4',envelope,'Exact-period distinct users and sessions for the apex and www RTA hostnames. Distinct users are not summed across dates.');
  s.evidenceFlow.push({title:'Executed request body',detail:JSON.stringify(envelope.request)});
  const headers=response.metricHeaders?.map(h=>h.name);
  requireValue(headers?.length===2&&new Set(headers).size===2&&headers.includes('totalUsers')&&headers.includes('sessions'),'Unexpected GA4 metric headers');
  requireValue((response.rows?.length??0)<=1&&Number(response.rowCount??response.rows?.length??0)<=1,'Unexpected GA4 report grain');
  const rows=(response.rows??[]).map(row=>{
    requireValue(!row.dimensionValues?.length&&row.metricValues?.length===2,'Unexpected GA4 dimensions or values');
    return {hostname:SITE_HOST,...validateRange(envelope.range),...Object.fromEntries(headers.map((h,i)=>[h,numeric(row.metricValues[i].value,{integer:true})]))};
  });
  return {queryId:'ga4_period_totals',query:{rows,source:s}};
}
export function normalizeGSC(envelope) {
  assertRequest(envelope.request,gscRequest(envelope.range));
  const response=envelope.response;
  requireValue(response?.responseAggregationType==='byProperty','Search report must use property-level aggregation');
  requireValue((response.rows?.length??0)<=1,'Unexpected Search Console report grain');
  const s=source('Search Console',envelope,'Property-level finalized Web search totals. Dates use Pacific Time; query-level rows may omit anonymized searches.');
  s.evidenceFlow.push({title:'Executed request body',detail:JSON.stringify(envelope.request)});
  const rows=(response.rows??[]).map(row=>{
    requireValue(!row.keys?.length,'Search report unexpectedly contains dimensions');
    return {hostname:SITE_HOST,...validateRange(envelope.range),clicks:numeric(row.clicks,{integer:true}),impressions:numeric(row.impressions,{integer:true})};
  });
  return {queryId:'gsc_period_totals',query:{rows,source:s}};
}
export function normalizeGoogleAds(envelope) {
  requireValue(typeof envelope.request?.query==='string'&&envelope.request.query===googleAdsQuery(envelope.range,envelope.campaignId),'Unexpected Ads query or campaign scope');
  requireValue(Array.isArray(envelope.response),'Expected a complete Google Ads SearchStream response');
  const s=source('Google Ads',envelope,'Campaign-day performance in AED. Platform conversions are not CRM-accepted leads.');
  s.coveredProviders=['Google Ads'];s.evidenceFlow.push({title:'Executed GAQL',detail:envelope.request.query});
  const seen=new Set();
  const rows=envelope.response.flatMap(chunk=>{
    requireValue(!chunk.error&&!chunk.nextPageToken,'Incomplete or failed Ads report');
    return (chunk.results??[]).map(row=>{
      requireValue(row.customer?.currencyCode==='AED'&&row.customer?.timeZone==='Asia/Dubai','Ads currency or timezone is incompatible');
      requireValue(String(row.campaign?.id)===String(envelope.campaignId),'Wrong campaign in report');
      const date=row.segments?.date;requireValue(validDay(date)&&date>=envelope.range.startDate&&date<=envelope.range.endDate,'Ads date outside request');
      requireValue(!seen.has(date),'Duplicate campaign-day observation');seen.add(date);
      return {date,provider:'Google Ads',campaign:safeLabel(row.campaign.name),currency:'AED',impressions:numeric(row.metrics.impressions,{integer:true}),clicks:numeric(row.metrics.clicks,{integer:true}),costAed:numeric(row.metrics.costMicros,{integer:true})/1e6,platformConversions:numeric(row.metrics.conversions)};
    });
  });
  s.reportedProvider='Google Ads';if(!rows.length)s.coveredProviders=[];
  return {queryId:'ads_campaign_daily',query:{rows,source:s}};
}
export function normalizeMicrosoftAds(envelope) {
  const response=envelope.response;
  requireValue(response?.reportType==='CampaignPerformanceReport'&&response.aggregation==='Daily'&&response.returnOnlyCompleteData===true&&response.reportTimeZone==='AbuDhabiMuscat','Microsoft report completeness, type, aggregation or timezone unverified');
  requireValue(Array.isArray(response.rows),'Missing Microsoft report rows');
  const s=source('Microsoft Advertising',envelope,'Owner-supplied complete daily CampaignPerformanceReport in AED. Live Microsoft API retrieval remains disabled pending an authenticated SDK binding.');
  s.coveredProviders=['Microsoft Advertising'];const seen=new Set();
  const rows=response.rows.map(row=>{
    requireValue(row.CurrencyCode==='AED'&&validDay(row.TimePeriod)&&row.TimePeriod>=envelope.range.startDate&&row.TimePeriod<=envelope.range.endDate,'Microsoft report scope mismatch');
    const key=`${row.TimePeriod}:${row.CampaignId}`;requireValue(!seen.has(key),'Duplicate Microsoft campaign day');seen.add(key);
    return {date:row.TimePeriod,provider:'Microsoft Advertising',campaign:safeLabel(row.CampaignName),currency:'AED',impressions:numeric(row.Impressions,{integer:true}),clicks:numeric(row.Clicks,{integer:true}),costAed:numeric(row.Spend),platformConversions:numeric(row.Conversions)};
  });
  s.reportedProvider='Microsoft Advertising';if(!rows.length)s.coveredProviders=[];
  return {queryId:'ads_campaign_daily',query:{rows,source:s}};
}
export function normalizeZoho(envelope) {
  requireValue(envelope.obtainedBy!=='api','Live Zoho report retrieval is disabled until an authenticated scoped binding is verified');
  requireValue(envelope.response?.complete===true&&Array.isArray(envelope.response.records),'Incomplete CRM export');
  requireValue(envelope.response.originCaptureCompleteFrom&&validDay(envelope.response.originCaptureCompleteFrom)&&envelope.response.originCaptureCompleteFrom<=envelope.range.startDate,'Historical exact-origin coverage is not established');
  const s=source('Zoho CRM',envelope,'Exact RTA-origin submissions created in the selected Dubai period; explicit test exclusion and unique submission IDs are required.');
  const records=[],seen=new Set();
  for(const row of envelope.response.records) {
    if(row.RTA_Website_Origin!==ORIGIN||row.RTA_Technical_Test===true)continue;
    requireValue(row.RTA_Technical_Test===false,'Technical-test exclusion is unknown');
    requireValue(typeof row.RTA_Submission_ID==='string'&&row.RTA_Submission_ID.length>0,'Missing submission deduplication key');
    const created=new Date(row.Created_Time);requireValue(!Number.isNaN(created.valueOf()),'Invalid CRM creation time');
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(created);
    const date=['year','month','day'].map(t=>parts.find(p=>p.type===t).value).join('-');
    if(date<envelope.range.startDate||date>envelope.range.endDate)continue;
    const key=row.RTA_Submission_ID.toLowerCase();requireValue(!seen.has(key),'Duplicate CRM submission key requires reconciliation');seen.add(key);
    records.push(row);
  }
  const range=validateRange(envelope.range),row={hostname:SITE_HOST,...range,acceptedEnquiries:records.length,technicalTestsExcluded:true,deduplicationVerified:true,qualifiedLeads:null,qualificationVerified:false,acceptedPaidEnquiries:null,paidAttributionVerified:false};
  const allowed=['New Lead','Qualification','Site Visit','Proposal Sent','Negotiation','Won','Lost'];
  const stages=[...allowed,'Unrecorded'].map(stage=>({stage,...range,enquiries:records.filter(r=>(allowed.includes(r.RTA_Lifecycle_Stage)?r.RTA_Lifecycle_Stage:'Unrecorded')===stage).length}));
  return {queryId:'crm_period_totals',query:{rows:[row],source:s},additionalQueries:{crm_pipeline:{rows:stages,source:s}}};
}
export function normalizeEnvelope(envelope) {
  requireValue(envelope?.schemaVersion===1,'Unsupported report envelope');
  requireValue(['api','owner-export'].includes(envelope.obtainedBy),'Unknown evidence acquisition method');
  const handlers={ga4:normalizeGA4,gsc:normalizeGSC,googleAds:normalizeGoogleAds,microsoftAds:normalizeMicrosoftAds,zoho:normalizeZoho};
  requireValue(!!handlers[envelope.provider],'Unsupported reporting source');
  return handlers[envelope.provider](envelope);
}
export function mergeQuery(existing,incoming) {
  if(!existing?.rows?.length||incoming.queryId!=='ads_campaign_daily')return incoming.query;
  requireValue(existing.source.coverage.startDate===incoming.query.source.coverage.startDate&&existing.source.coverage.endDate===incoming.query.source.coverage.endDate,'Paid platform imports must cover the exact same range');
  const providers=incoming.query.source.coveredProviders,reported=incoming.query.source.reportedProvider;
  const rows=[...existing.rows.filter(r=>r.provider!==reported),...incoming.query.rows];
  return {rows,source:{...incoming.query.source,provider:'Google Ads / Microsoft Advertising',coveredProviders:[...new Set([...(existing.source.coveredProviders??[]).filter(p=>p!==reported),...providers])],evidenceFlow:[...(existing.source.evidenceFlow??[]),...incoming.query.source.evidenceFlow]}};
}
