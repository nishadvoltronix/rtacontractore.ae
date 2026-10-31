import React, {useMemo} from 'react';
import {Button,DataComponent,DataTable,DateRangePicker,Dropdown,EvidenceChart,Filters,MetricCard,Section,SortableRegion,SortableItem,useDataApp,useDashboardTabs} from '../../data-app-public.jsx';
import {PRESETS,PRESET_LABELS,periodRange,previousRange,rangeLabel,metricsFor,formatValue,availableDays,covered,nativeGSCSelection,METRIC_QUERIES} from '../shared/rta-model.js';
import './dashboard.css';

const tabs=[{id:'overview',label:'Overview'},{id:'search',label:'Search & AI'},{id:'paid',label:'Paid advertising'},{id:'pipeline',label:'Pipeline'},{id:'connections',label:'Connections'}].map(t=>({...t,filterIds:t.id==='connections'?[]:['period','customRange']}));
const cols=(...pairs)=>pairs.map(([field,label])=>({field,label}));
function selectedRows(query,range) {
  if(!range||!covered(query,range))return [];
  return query.rows.filter(r=>r.date?r.date>=range.startDate&&r.date<=range.endDate:r.startDate===range.startDate&&r.endDate===range.endDate);
}
function EvidenceTable({id,queryId,title,columns,range,note}) {
  const {queries}=useDataApp(),q=queries[queryId];
  const rows=range===undefined?q.rows:selectedRows(q,range);
  const native=q.source.acquisition?.kind==='native_browser_csv',c=q.source.coverage;
  const exactSnapshot=native&&range?.startDate===c.startDate&&range?.endDate===c.endDate;
  const emptyObserved=exactSnapshot&&q.source.emptyResultObserved;
  const missing=native?(emptyObserved?q.source.description:`This table was exported for ${rangeLabel(c)}. No corresponding rows were supplied for the selected range.`):note;
  return <DataComponent id={id} queryId={queryId} title={title} kind="table" variant="card" displayRows={rows} sourceRows={rows} description={q.source.description} scopeFilters={range?[{label:'Reporting period',field:'date',value:rangeLabel(range)}]:[]}>
    {rows.length?<DataTable rows={rows} columns={columns} label={title} searchable={rows.length>8}/>:<div className="rta-empty" role="status"><strong>{emptyObserved?'No rows exported':'Unavailable'}</strong><p>{missing??'No verified observations cover this reporting period.'}</p></div>}
  </DataComponent>;
}
function Metric({metric,range,values}) {
  const {queries}=useDataApp(),ids=METRIC_QUERIES[metric.id].filter(id=>queries[id]&&!(id==='gsc_native_daily'&&queries[id].source.activeForMetrics===false)),val=values[metric.id];
  const sourceRowsByQuery=Object.fromEntries(ids.map(id=>[id,selectedRows(queries[id],range)]));
  sourceRowsByQuery.metric_availability=[metric];
  return <MetricCard id={`metric-${metric.id}`} queryId={ids[0]} queryIds={[...ids,'metric_availability']} title={metric.label} value={formatValue(val,metric.unit)} displayRows={[{metric:metric.label,value:val,status:val===null?'Unavailable':'Observed',startDate:range?.startDate??null,endDate:range?.endDate??null}]} sourceRowsByQuery={sourceRowsByQuery} scopeFilters={[{label:'Reporting period',field:'date',value:rangeLabel(range)}]} description={metric.definition}>
    <p className="rta-metric-note">{val===null?metric.reason:ids.some(id=>queries[id].source.acquisition?.kind==='native_browser_csv')?'Reported native snapshot; may be revised':'Verified observations for the selected period'}</p>
  </MetricCard>;
}
function Metrics({ids,range,values,scope}) {
  const {queries}=useDataApp();
  const definitions=ids.map(id=>queries.metric_availability.rows.find(m=>m.id===id));
  return <SortableRegion id={`rta:${scope}:metrics`} variant="canvas" spacing="standard" columns={12} rows={[{id:`${scope}:metrics`,kind:'metrics',items:ids.map(id=>`metric-${id}`)}]} label={`${scope} metrics`}>
    {definitions.map(metric=><SortableItem key={metric.id} id={`metric-${metric.id}`} label={metric.label} kind="metric" span={ids.length===3?4:3}><Metric {...{metric,range,values}}/></SortableItem>)}
  </SortableRegion>;
}
function PaidTrend({range}) {
  const {queries}=useDataApp(),raw=selectedRows(queries.ads_campaign_daily,range),byDay=new Map();
  for(const row of raw){const key=`${row.date}:${row.provider}`;const item=byDay.get(key)??{date:row.date,provider:row.provider,costAed:0};item.costAed+=row.costAed;byDay.set(key,item);}
  const rows=[...byDay.values()].sort((a,b)=>a.date.localeCompare(b.date));
  return rows.length?<EvidenceChart id="paid-spend-trend" queryId="ads_campaign_daily" title="Reported campaign spend" spec={{type:'line',x:'date',y:'costAed',series:'provider',currency:'AED',valueDecimals:2,showXAxisLabel:false,showYAxisLabel:false}} rows={rows} sourceRows={raw} variant="card" height={260}/>:<DataComponent id="paid-spend-trend" queryId="ads_campaign_daily" title="Reported campaign spend" kind="chart" variant="card" displayRows={[]} sourceRows={[]}><div className="rta-empty"><strong>Unavailable</strong><p>No verified daily advertising observations are loaded.</p></div></DataComponent>;
}
function NativeSearchSnapshot({range}) {
  const {queries}=useDataApp(),q=queries.gsc_native_daily;
  if(!q?.rows.length)return null;
  const rows=nativeGSCSelection(q,range),plot=rows.flatMap(row=>[{date:row.date,measure:'Clicks',count:row.clicks},{date:row.date,measure:'Impressions',count:row.impressions}]);
  const fields=[{field:'date',label:'Date'},{field:'clicks',label:'Clicks'},{field:'impressions',label:'Impressions'},{field:'ctr',label:'CTR',renderCell:value=>value===null?'Unavailable':new Intl.NumberFormat('en-GB',{style:'percent',maximumFractionDigits:2}).format(value)},{field:'position',label:'Average position',renderCell:value=>value===null?'Unavailable':value}];
  return <Section id="native-search-heading" title="Native Web (text-based) snapshot" spacing="after-metrics">
    <p className="rta-scope-note">Native browser CSV export observed {q.source.observedExportDate}. Available dates: {rangeLabel(q.source.coverage)} (Pacific Time). Snapshot data may be revised. Blank CTR and position are unavailable.</p>
    {rows.length?<>
      <EvidenceChart id="native-search-trend" queryId="gsc_native_daily" title="Reported clicks and impressions" spec={{type:'bar',x:'date',y:'count',series:'measure',stackable:false,startAtZero:true,valueDecimals:0,yTickCount:2,showXAxisLabel:false,showYAxisLabel:false}} rows={plot} sourceRows={rows} variant="card" height={260}/>
      <DataComponent id="native-search-days" queryId="gsc_native_daily" title="Reported daily observations" kind="table" variant="card" displayRows={rows} sourceRows={rows} scopeFilters={[{label:'Selected export dates',field:'date',value:rangeLabel(range)}]}><DataTable rows={rows} columns={fields} label="Native Search Console daily observations" searchable={false}/></DataComponent>
    </>:<DataComponent id="native-search-trend" queryId="gsc_native_daily" title="Reported clicks and impressions" kind="chart" variant="card" displayRows={[]} sourceRows={[]}><div className="rta-empty"><strong>Unavailable for selected dates</strong><p>Select the available export dates to inspect the actual reported snapshot. Uncovered dates are not filled with zeros.</p></div></DataComponent>}
  </Section>;
}
const TABLES={
 search:[
  ['search-queries','gsc_queries','Search queries',cols(['query','Query'],['clicks','Clicks'],['impressions','Impressions'],['position','Average position']),'Connect Search Console reporting. Top query rows can omit anonymized queries and cannot replace property totals.'],
  ['search-pages','gsc_pages','Search result pages',cols(['page','Page'],['clicks','Clicks'],['impressions','Impressions']),'No Search Console page report is loaded. These observations are search clicks and impressions, not Analytics landing-page sessions.'],
  ['ai-referrals','ga4_ai_referrals','Identifiable AI referrals',cols(['referrerHost','Referrer'],['sessions','Sessions']),'No reviewed AI-referral report is loaded. Referrals do not measure all AI visibility or prove citations.'],
  ['ai-native','native_ai_visibility','Native AI performance',cols(['provider','Provider'],['measure','Measure'],['value','Value']),'Check actual access to native Google and Bing AI reports, then import verified measures. Availability has not been established.']],
 paid:[
  ['paid-campaigns','ads_campaign_daily','Campaign performance',cols(['date','Date'],['provider','Platform'],['campaign','Campaign'],['impressions','Impressions'],['clicks','Clicks'],['costAed','Spend (AED)'],['platformConversions','Platform conversions']),'No covered campaign reports are loaded. Ads-platform conversions remain separate from accepted CRM enquiries.'],
  ['paid-keywords','ads_keywords','Keywords',cols(['keyword','Keyword'],['matchType','Match type'],['clicks','Clicks'],['costAed','Spend (AED)'])],
  ['paid-pages','paid_landing_pages','Paid landing pages',cols(['page','Landing page'],['clicks','Clicks'],['costAed','Spend (AED)'])]],
 pipeline:[['pipeline-stages','crm_pipeline','RTA lifecycle stages',cols(['stage','Stage'],['enquiries','Enquiries']),'The RTA lifecycle field exists, but verified stage observations are not loaded. Global corporate lead statuses have not been remapped.']]
};
export function DashboardContent() {
  const {queries,filters,setFilter}=useDataApp();
  const native=queries.gsc_native_daily?.rows.length?queries.gsc_native_daily:null,nativeCoverage=native?.source.coverage;
  const availableNativeRange=nativeCoverage?`${nativeCoverage.startDate}..${nativeCoverage.endDate}`:'';
  const registeredTabs=useMemo(()=>tabs.map(t=>t.id==='search'&&availableNativeRange&&native.source.activeForMetrics!==false?{...t,defaultFilters:{period:'custom',customRange:availableNativeRange}}:t),[availableNativeRange,native?.source.activeForMetrics]);
  const {activeTabId}=useDashboardTabs(registeredTabs),tab=tabs.some(t=>t.id===activeTabId)?activeTabId:'overview';
  const days=useMemo(()=>availableDays(queries),[queries]);
  const preset=filters.period??'last7',custom=filters.customRange??'',range=periodRange(preset,custom),previous=previousRange(range),values=metricsFor(queries,range);
  const definitions=queries.metric_availability.rows.map(m=>({...m,status:values[m.id]===null?'Unavailable':'Observed for selected period',reason:values[m.id]===null?m.reason:'Covered observations loaded'})),customFallback=days.length?`${days[0]}..${days.at(-1)}`:'';
  const metricIDs={overview:['visitors','enquiries','spend','cpl'],search:['searchClicks','searchImpressions','aiSessions'],paid:['spend','cpl','conversionRate'],pipeline:['enquiries','qualified','quoteValue','revenue']}[tab];
  return <div className="rta-dashboard">
    {tab!=='connections'&&<Filters filters={[]} queries={queries} values={filters} onChange={setFilter} sticky ariaLabel="Reporting period"><div className="rta-period-controls">
      <Dropdown label="Period" showLabel value={preset} choices={PRESETS} choiceLabels={PRESET_LABELS} onChange={value=>{setFilter('period',value);if(value==='custom'&&!periodRange('custom',custom)&&customFallback)setFilter('customRange',customFallback);}}/>
      {preset==='custom'&&<DateRangePicker label="Covered custom range" value={custom||customFallback} choices={days} onChange={value=>setFilter('customRange',value)}/>}
      <Button onClick={()=>{setFilter('period','last7');setFilter('customRange','all');}}>Reset period</Button>
      {tab==='search'&&availableNativeRange&&<Button onClick={()=>{setFilter('period','custom');setFilter('customRange',availableNativeRange);}}>View available dates</Button>}
      <span className="rta-range" aria-live="polite">{rangeLabel(range)}</span>
    </div></Filters>}
    {metricIDs&&<Metrics ids={metricIDs} range={range} values={values} scope={tab}/>}
    {tab==='search'&&<NativeSearchSnapshot range={range}/>}
    {tab==='overview'&&<>
      <p className="rta-scope-note">Dates follow each provider’s reporting timezone. Prior period: {rangeLabel(previous)}. Comparable performance is unavailable until complete source data is loaded.</p>
      <Section id="overview-actions-heading" title="Actions before performance decisions" spacing="after-metrics"><EvidenceTable id="overview-actions" queryId="owner_actions" title="Implementation queue" columns={cols(['priority','Priority'],['area','Area'],['action','Next action'],['status','Status'])}/></Section>
      <Section id="overview-coverage-heading" title="Measurement coverage"><DataComponent id="coverage-metrics" queryId="metric_availability" kind="table" title="Required measurements" variant="card" displayRows={definitions} sourceRows={definitions}><DataTable rows={definitions} columns={cols(['label','Measurement'],['provider','Source'],['status','Availability'],['reason','Remaining requirement'])} label="Required marketing measurements"/></DataComponent></Section>
    </>}
    {TABLES[tab]&&<Section id={`${tab}-details-heading`} title={{search:'Search and AI observations',paid:'Traffic quality',pipeline:'Enquiry pipeline'}[tab]} spacing="after-metrics" columns={tab==='search'?2:1}>{TABLES[tab].map(([id,queryId,title,columns,note])=><EvidenceTable key={id} {...{id,queryId,title,columns,note,range}}/>)}</Section>}
    {tab==='paid'&&<Section id="paid-trend-heading" title="Spend over time"><PaidTrend range={range}/></Section>}
    {tab==='pipeline'&&<Section id="pipeline-rules-heading" title="Attribution requirements"><DataComponent id="pipeline-definition" queryId="metric_availability" title="Enquiry and revenue definitions" kind="table" variant="card" displayRows={definitions.filter(m=>['enquiries','qualified','quoteValue','revenue'].includes(m.id))} sourceRows={definitions.filter(m=>['enquiries','qualified','quoteValue','revenue'].includes(m.id))}><DataTable rows={definitions.filter(m=>['enquiries','qualified','quoteValue','revenue'].includes(m.id))} columns={cols(['label','Measurement'],['definition','Definition'],['reason','Remaining requirement'])} label="RTA pipeline measurement definitions" searchable={false}/></DataComponent></Section>}
    {tab==='connections'&&<><p className="rta-scope-note">Configuration audit as of 1 November 2026. These fixed observations are independent of performance-date filters. Automatic report refresh is not connected.</p><Section id="connections-heading" title="Sources and implementation status" spacing="none"><EvidenceTable id="source-readiness" queryId="source_readiness" title="Connection readiness" columns={cols(['provider','Source'],['status','Status'],['observation','Verified observation'],['nextAction','Next action'])}/></Section></>}
    {preset==='custom'&&tab!=='connections'&&!days.length&&<p className="rta-scope-note" role="status">Custom selection becomes available when a source provides verified date coverage. No dated performance observations are loaded.</p>}
  </div>;
}
