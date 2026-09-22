import { useEffect, useState } from 'react';
import { getJson, sendJson } from './api.js';
export interface ResearchBody {text:string;theme:string;category:string;sourceType:string;sourceUrl:string|null;sourceDate:string|null;context:string;approvedRedacted:true;audienceRelevance:string;teachingUsefulness:string;productionEffort:string;recentCoverage:string;archived:boolean}
export interface ResearchRow {id:string;version:number;body:ResearchBody;updatedAt:string}
export interface Topic {theme:string;evidenceIds:string[];verifiedOccurrences:number;referenceIds:string[];reasons:string[];mode:string}
const blank:ResearchBody={text:'',theme:'',category:'learning',sourceType:'learner_question',sourceUrl:null,sourceDate:null,context:'',approvedRedacted:true,audienceRelevance:'',teachingUsefulness:'',productionEffort:'unknown',recentCoverage:'',archived:false};
export function AudienceResearch({standalone=false}:{standalone?:boolean}){
 const [rows,setRows]=useState<ResearchRow[]>([]),[topics,setTopics]=useState<Topic[]>([]),[value,setValue]=useState(blank),[id,setId]=useState<string>(()=>crypto.randomUUID()),[version,setVersion]=useState(0),[approved,setApproved]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 function load(){getJson<{records:ResearchRow[];topics:Topic[]}>('/api/studio/research').then(p=>{setRows(p.records);setTopics(p.topics);}).catch(e=>setMessage(e.message));}
 useEffect(()=>{load();const selectedId=new URLSearchParams(window.location.search).get('id');if(selectedId)void getJson<{record:ResearchRow}>(`/api/studio/research/${selectedId}`).then(({record:r})=>{setId(r.id);setVersion(r.version);setValue(r.body);setApproved(false);}).catch(e=>setMessage('Could not open this audience entry: '+String(e)));},[]);
 function reset(){setId(crypto.randomUUID());setVersion(0);setValue(blank);setApproved(false);}
 async function save(){setBusy(true);try{await sendJson('PUT',`/api/studio/research/${id}`,{expectedVersion:version,requestId:crypto.randomUUID(),body:value});reset();load();setMessage('Saved approved research.');}catch(e){setMessage(String(e));}finally{setBusy(false);}}
 return <details className="card studio" open={standalone||undefined}><summary>Audience questions & topic opportunities</summary><div className="notice">Topic counts measure distinct approved entries, not the size of the audience. Check the source date before reusing a question.</div><p className="dim">Enter anonymous, approved text only. No private messages, contact details or inferred sensitive traits. Public references are for studying structure, not copying scripts.</p>
 <div className="studio-fields">
 <label>Category<select value={value.category} onChange={e=>setValue({...value,category:e.target.value})}>{['learning','purchase','reaction','spam'].map(k=><option key={k}>{k}</option>)}</select></label>
 <label>Source type<select value={value.sourceType} onChange={e=>setValue({...value,sourceType:e.target.value,sourceUrl:e.target.value==='redacted_objection'?null:value.sourceUrl})}>{['public_comment','learner_question','redacted_objection','public_reference','creative_exploration'].map(k=><option key={k}>{k}</option>)}</select></label>
 <label>Theme<input value={value.theme} onChange={e=>setValue({...value,theme:e.target.value})}/></label>
 <label>Source date<input type="date" value={value.sourceDate??''} onChange={e=>setValue({...value,sourceDate:e.target.value||null})}/></label>
 {value.sourceType!=='redacted_objection'&&<label>Approved public source URL<input value={value.sourceUrl??''} onChange={e=>setValue({...value,sourceUrl:e.target.value||null})}/></label>}
 </div>
 <label>Question / anonymous theme / structure note<textarea value={value.text} onChange={e=>setValue({...value,text:e.target.value})}/></label>
 <div className="studio-fields">{(['context','audienceRelevance','teachingUsefulness','recentCoverage'] as const).map(k=><label key={k}>{({context:'Context',audienceRelevance:'Audience relevance',teachingUsefulness:'Teaching usefulness',recentCoverage:'Recent channel coverage'})[k]}<textarea value={value[k]} onChange={e=>setValue({...value,[k]:e.target.value})}/></label>)}
 <label>Production effort<select value={value.productionEffort} onChange={e=>setValue({...value,productionEffort:e.target.value})}>{['unknown','small','medium','large'].map(k=><option key={k}>{k}</option>)}</select></label></div>
 <label><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/> I approve this anonymous/redacted entry for the marketing team</label><label><input type="checkbox" checked={value.archived} onChange={e=>setValue({...value,archived:e.target.checked})}/> Archive this entry</label>
 <button disabled={!approved||busy} onClick={()=>void save()}>Save entry</button> <button onClick={reset}>New entry</button><p role="status">{message}</p>
 <h3>Topic opportunities</h3><p className="dim">Frequency counts distinct approved inbox entries, not total audience demand. References and explorations do not increase demand counts.</p>
 {topics.map(t=><div className="card" key={t.theme}><strong>{t.theme}</strong> · {t.mode} · {t.verifiedOccurrences} question/objection entries<ul>{t.reasons.map((r,i)=><li key={i}>{r}</li>)}</ul><p>Evidence: {t.evidenceIds.map(id=>{const r=rows.find(r=>r.id===id);return <button key={id} onClick={()=>{if(r){setId(r.id);setVersion(r.version);setValue(r.body);setApproved(false);}}}>{r?.body.text.slice(0,65)??id}</button>;})}</p></div>)}
 <details><summary>All entries ({rows.length}, latest 500)</summary>{rows.map(r=><p key={r.id}><button onClick={()=>{setId(r.id);setVersion(r.version);setValue(r.body);setApproved(false);}}>{r.body.theme} · {r.body.category} · {r.body.text.slice(0,90)}</button></p>)}</details>
 </details>;
}
