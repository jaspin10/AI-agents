import { useEffect, useState } from 'react';
import { BriefLab } from './BriefLab.js';
import { getJson, type SuggestionRow } from './api.js';
import { useBrain } from './brain-ui.js';
export function BriefWorkspace() {
  const [suggestions,setSuggestions]=useState<SuggestionRow[]|null>(null),[error,setError]=useState<string|null>(null);
  const {data,error:brainError,refresh}=useBrain(),example=new URLSearchParams(window.location.search).get('example');
  useEffect(()=>{getJson<SuggestionRow[]>('/api/suggestions').then(setSuggestions).catch(e=>setError(String(e)));},[]);
  if(error)return <div className="card" role="alert">Unable to load suggestions: {error}</div>;
  if(example&&brainError)return <div className="card" role="alert">Unable to read the source video. <button className="btn" onClick={refresh}>Try again</button></div>;
  if(suggestions===null||example&&!data)return <div className="card" role="status">Opening brief workspace…</div>;
  const seed=data?.videos?.find(v=>v.id===example);
  if(example&&!seed)return <div className="card" role="alert">The source video is unavailable. Return to Results and reload the evidence before creating this follow-up.</div>;
  return <BriefLab suggestions={suggestions} standalone seed={seed?{id:seed.id,title:seed.title??'Follow-up lesson',platform:seed.platform,test:seed.nextTest}:undefined}/>;
}
