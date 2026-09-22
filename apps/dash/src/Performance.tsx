import { useMemo, useState } from 'react';
import { BRAIN_OUTCOME_LABELS, brainMetricValue, type BrainOutcome } from '@platform/shared/browser';
import { BrainLink, BrainLoading, BrainSourceNotice, useBrain, number, percent, date } from './brain-ui.js';
import { VideoDetails } from './VideoDiagnosis.js';

export function Performance() {
  const {data,error,refresh}=useBrain();
  const params=new URLSearchParams(window.location.search),id=params.get('id');
  const [platform,setPlatform]=useState('all'),[outcome,setOutcome]=useState(params.get('filter')??'all');
  const [search,setSearch]=useState(''),[sort,setSort]=useState('recent'),[limit,setLimit]=useState(60);
  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return (data?.videos??[]).filter(v=>(platform==='all'||v.platform===platform)&&(outcome==='all'||v.outcome===outcome)&&(!q||(v.title??'').toLowerCase().includes(q)||v.platformVideoId.includes(q))).sort((a,b)=>{
      const group=platform==='all'?a.platform.localeCompare(b.platform):0;
      if(group)return group;
      if(sort==='views')return (brainMetricValue(b,'views')??-1)-(brainMetricValue(a,'views')??-1);
      if(sort==='engagement')return (b.rates?.engagementRatePct??-1)-(a.rates?.engagementRatePct??-1);
      if(sort==='shares')return (b.rates?.shareRatePct??-1)-(a.rates?.shareRatePct??-1);
      if(sort==='retention')return (brainMetricValue(b,'retentionPct')??-1)-(brainMetricValue(a,'retentionPct')??-1);
      return b.postedAt.localeCompare(a.postedAt);
    });
  },[data,platform,outcome,search,sort]);
  if(!data)return <BrainLoading error={error} retry={refresh}/>;
  const selected=data.videos?.find(v=>v.id===id);
  if(id&&selected)return <><BrainLink className="back-link" to={{view:'performance'}}>← All published videos</BrainLink><BrainSourceNotice data={data}/><VideoDetails id={selected.id} data={data}/></>;
  const platforms=[...new Set((data.videos??[]).map(v=>v.platform))].sort();
  return <><BrainSourceNotice data={data}/>
    {id&&!selected&&<div className="notice warning">This video is unavailable in the current data. Try refreshing or return to its content notes.</div>}
    <div className="results-summary">{(['above','typical','below','insufficient','unmeasured'] as BrainOutcome[]).map(o=><button key={o} className={'outcome-filter '+(outcome===o?'selected':'')} aria-pressed={outcome===o} onClick={()=>{setOutcome(outcome===o?'all':o);setLimit(60);}}><span className={'outcome-dot outcome-'+o}/><strong>{data.videos?number(data.videos.filter(v=>v.outcome===o).length):'—'}</strong><span>{BRAIN_OUTCOME_LABELS[o]}</span></button>)}</div>
    <div className="card"><div className="results-tools"><label>Find a video<input className="input" placeholder="Search title or platform ID" value={search} onChange={e=>{setSearch(e.target.value);setLimit(60);}}/></label><label>Platform<select className="select" value={platform} onChange={e=>{setPlatform(e.target.value);setLimit(60);}}><option value="all">All platforms, grouped</option>{platforms.map(p=><option key={p}>{p}</option>)}</select></label><button className="btn" onClick={()=>{setOutcome('all');setSearch('');setPlatform('all');}}>Clear filters</button><button className="btn" onClick={refresh}>Refresh data</button></div>
      <p className="hint table-caption">{visible.length} videos · latest recorded metrics · sort within each platform. Outcome compares exact day 1, 7 or 30 engagement to at least 8 other comparable videos.</p>
      <div className="table-scroll" role="region" aria-label="Published video results" tabIndex={0}><table className="results-table"><thead><tr><th>Video / platform</th>{[['recent','Posted'],['views','Views'],['engagement','Engagement'],['shares','Share rate'],['retention','Avg. retention']].map(([key,label])=><th key={key} aria-sort={sort===key?'descending':'none'}><button className="sort-button" onClick={()=>setSort(key!)}>{label} {sort===key?'↓':'↕'}</button></th>)}<th>Comparison</th></tr></thead><tbody>
        {visible.slice(0,limit).map(v=><tr key={v.id}><td><BrainLink to={{view:'performance',id:v.id}} className="video-title">{v.title??'Untitled video'}</BrainLink><span className="subtle-label">{v.platform}{v.stale?' · snapshot needs refresh':''}</span></td><td>{date(v.postedAt)}</td><td>{number(brainMetricValue(v,'views'))}</td><td>{percent(v.rates?.engagementRatePct)}</td><td>{percent(v.rates?.shareRatePct)}</td><td>{percent(brainMetricValue(v,'retentionPct'))}</td><td><span className={'outcome-pill outcome-'+v.outcome}>{BRAIN_OUTCOME_LABELS[v.outcome]}</span>{v.comparison.day!==null&&<small className="subtle-label">day {v.comparison.day} · {v.comparison.n} peers</small>}</td></tr>)}
      </tbody></table></div>
      {!visible.length&&<div className="empty-state"><strong>{data.videos===null?'Results source unavailable':'No videos in this view'}</strong><p>{data.videos===null?'Retry after the source is available. The rest of the workspace is still accessible.':'Clear the filters or wait for published content to be ingested.'}</p></div>}
      {visible.length>limit&&<button className="btn load-more" onClick={()=>setLimit(n=>n+60)}>Show next {Math.min(60,visible.length-limit)} videos</button>}
      <p className="data-footnote">Legacy metric definitions can be unverified. Missing snapshots stay missing; unsupported shares show n/a. Open a video to inspect provenance and limitations.</p>
    </div>
  </>;
}
