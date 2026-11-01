export const SITE_HOST = 'rtacontractor.ae';
export const PRESETS = ['today','yesterday','last7','last30','thisMonth','lastMonth','custom'];
export const PRESET_LABELS = {today:'Today',yesterday:'Yesterday',last7:'Last 7 days',last30:'Last 30 days',thisMonth:'This month',lastMonth:'Last month',custom:'Custom'};
const DAY = 86400000;
export function isoDay(value = new Date(), timeZone = 'Asia/Dubai') {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
  return ['year','month','day'].map(type => parts.find(p => p.type === type).value).join('-');
}
export function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
}
export function shiftDay(value, days) {
  if (!validDay(value)) throw new Error('Invalid ISO reporting day');
  return new Date(Date.parse(value+'T00:00:00Z') + days*DAY).toISOString().slice(0,10);
}
export function periodRange(preset='last7', custom='', today=isoDay()) {
  if (!validDay(today)) throw new Error('Invalid reporting anchor');
  let start=today, end=today;
  if (preset === 'yesterday') start=end=shiftDay(today,-1);
  else if (preset === 'last7') start=shiftDay(today,-6);
  else if (preset === 'last30') start=shiftDay(today,-29);
  else if (preset === 'thisMonth') start=today.slice(0,8)+'01';
  else if (preset === 'lastMonth') {end=shiftDay(today.slice(0,8)+'01',-1); start=end.slice(0,8)+'01';}
  else if (preset === 'custom') {
    const parts=String(custom).split('..');
    if (parts.length!==2 || !parts.every(validDay) || parts[0]>parts[1]) return null;
    [start,end]=parts;
  } else if (preset !== 'today') throw new Error('Unknown reporting preset');
  return {startDate:start,endDate:end,days:Math.round((Date.parse(end)-Date.parse(start))/DAY)+1};
}
export function previousRange(range) {
  if (!range) return null;
  const endDate=shiftDay(range.startDate,-1);
  return {startDate:shiftDay(endDate,1-range.days),endDate,days:range.days};
}
export function rangeLabel(range) {
  if (!range) return 'Choose a covered date range';
  const f=d=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T00:00:00Z'));
  return range.startDate===range.endDate ? f(range.startDate) : `${f(range.startDate)} – ${f(range.endDate)}`;
}
export function covered(query,range) {
  const c=query?.source?.coverage;
  return !!range && c?.status==='complete' && validDay(c.startDate) && validDay(c.endDate) && c.startDate<=range.startDate && c.endDate>=range.endDate;
}
export function scopedRows(query,range,field='date') {
  if (!range) return [];
  return (query?.rows??[]).filter(r=>validDay(r[field]) && r[field]>=range.startDate && r[field]<=range.endDate);
}
export function exactPeriodRow(query,range) {
  if (!covered(query,range)) return null;
  const rows=(query?.rows??[]).filter(r=>r.startDate===range.startDate && r.endDate===range.endDate && r.hostname===SITE_HOST);
  return rows.length===1 ? rows[0] : null;
}
export function sumKnown(rows,field) {
  return !rows.length || rows.some(r=>!Number.isFinite(r[field]) || r[field]<0) ? null : rows.reduce((sum,row)=>sum+row[field],0);
}
export function ratio(numerator,denominator) {
  return Number.isFinite(numerator) && numerator>=0 && Number.isFinite(denominator) && denominator>0 ? numerator/denominator : null;
}
export function nativeGSCSelection(query,range) {
  if(query?.source?.acquisition?.kind!=='native_browser_csv'||query.source.property!=='https://rtacontractor.ae/'||!covered(query,range))return [];
  const rows=scopedRows(query,range),expected=[];
  for(let date=range.startDate;date<=range.endDate;date=shiftDay(date,1))expected.push(date);
  return rows.length===expected.length&&rows.every((row,i)=>row.date===expected[i])?rows:[];
}
export function metricsFor(queries,range) {
  const ga=exactPeriodRow(queries.ga4_period_totals,range);
  const rawCRM=exactPeriodRow(queries.crm_period_totals,range);
  const crm=rawCRM?.technicalTestsExcluded===true && rawCRM?.deduplicationVerified===true ? rawCRM : null;
  const gsc=exactPeriodRow(queries.gsc_period_totals,range);
  const native=queries.gsc_native_daily?.source?.activeForMetrics!==false?nativeGSCSelection(queries.gsc_native_daily,range):[];
  const ads=covered(queries.ads_campaign_daily,range) ? scopedRows(queries.ads_campaign_daily,range) : [];
  const providers=queries.ads_campaign_daily?.source?.coveredProviders??[];
  const both=['Google Ads','Microsoft Advertising'].every(p=>providers.includes(p));
  const spend=both && ads.every(r=>r.currency==='AED') ? sumKnown(ads,'costAed') : null;
  const value=(row,key)=>Number.isFinite(row?.[key]) && row[key]>=0 ? row[key] : null;
  const visitors=value(ga,'totalUsers'), sessions=value(ga,'sessions'), enquiries=value(crm,'acceptedEnquiries');
  const paid=crm?.paidAttributionVerified===true ? value(crm,'acceptedPaidEnquiries') : null;
  const ai=exactPeriodRow(queries.ga4_ai_referrals,range), revenue=exactPeriodRow(queries.crm_revenue,range);
  return {visitors,sessions,enquiries,qualified:crm?.qualificationVerified===true?value(crm,'qualifiedLeads'):null,spend,
    cpl:ratio(spend,paid),conversionRate:ratio(enquiries,sessions),searchClicks:native.length?sumKnown(native,'clicks'):value(gsc,'clicks'),searchImpressions:native.length?sumKnown(native,'impressions'):value(gsc,'impressions'),
    aiSessions:ai?.classificationReviewed===true?value(ai,'sessions'):null,
    quoteValue:revenue?.quoteJoinVerified===true && revenue.currency==='AED'?value(revenue,'quoteValueAed'):null,
    revenue:revenue?.revenueAttributionVerified===true && revenue.currency==='AED'?value(revenue,'wonRevenueAed'):null};
}
export function availableDays(queries) {
  const set=new Set();
  for (const [id,q] of Object.entries(queries??{})) {
    if (['source_readiness','metric_availability','owner_actions'].includes(id)) continue;
    const c=q.source?.coverage;
    if (!q.rows?.length || c?.status!=='complete' || !validDay(c.startDate) || !validDay(c.endDate) || c.startDate>c.endDate || (Date.parse(c.endDate)-Date.parse(c.startDate))/DAY>1096) continue;
    for (let d=c.startDate; d<=c.endDate; d=shiftDay(d,1)) set.add(d);
  }
  return [...set].sort();
}
export function formatValue(value,unit='count') {
  if (!Number.isFinite(value)) return 'Unavailable';
  if (unit==='AED') return new Intl.NumberFormat('en-AE',{style:'currency',currency:'AED',maximumFractionDigits:0}).format(value);
  if (unit==='ratio') return new Intl.NumberFormat('en-GB',{style:'percent',maximumFractionDigits:1}).format(value);
  return new Intl.NumberFormat('en-GB',{maximumFractionDigits:0}).format(value);
}
export const METRIC_QUERIES={visitors:['ga4_period_totals'],sessions:['ga4_period_totals'],enquiries:['crm_period_totals'],qualified:['crm_period_totals'],spend:['ads_campaign_daily'],cpl:['ads_campaign_daily','crm_period_totals'],conversionRate:['ga4_period_totals','crm_period_totals'],searchClicks:['gsc_native_daily','gsc_period_totals'],searchImpressions:['gsc_native_daily','gsc_period_totals'],aiSessions:['ga4_ai_referrals'],quoteValue:['crm_revenue'],revenue:['crm_revenue']};
