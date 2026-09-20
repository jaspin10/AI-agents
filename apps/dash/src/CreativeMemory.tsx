import { useEffect, useState } from 'react';
import { getJson, sendJson } from './api.js';
interface Annotation {id:string;kind:'transcript'|'scene'|'hook'|'payoff'|'cta'|'other';startSeconds:number;endSeconds:number;text:string;confidence:'observed'|'uncertain';review:'draft'|'reviewed'}
export interface MemoryBody {audience:string;learnerLevel:string;topic:string;purpose:string;languageMix:string[];durationSeconds:number|null;openingLine:string;firstPayoffSeconds:number|null;ctaSeconds:number|null;asset:{url:string;version:string;fingerprint:string;approvedReference:true}|null;contributors:{writer:string;filmer:string;editor:string};classification:{value:'uncertain'|'short'|'long';source:string;reviewed:boolean};annotations:Annotation[]}
interface Revision {version:number;body:MemoryBody;updatedBy:string;updatedAt:string}
const empty:MemoryBody={audience:'',learnerLevel:'',topic:'',purpose:'',languageMix:[],durationSeconds:null,openingLine:'',firstPayoffSeconds:null,ctaSeconds:null,asset:null,contributors:{writer:'',filmer:'',editor:''},classification:{value:'uncertain',source:'',reviewed:false},annotations:[]};
export function CreativeMemory({contentId}:{contentId:string}) {
 const [value,setValue]=useState<MemoryBody>(empty),[version,setVersion]=useState(0),[history,setHistory]=useState<Revision[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 function load(){getJson<{record:Revision|null;history:Revision[]}>(`/api/studio/memory/${contentId}`).then(p=>{setValue(p.record?.body??empty);setVersion(p.record?.version??0);setHistory(p.history);}).catch(e=>setMessage(e.message));}
 useEffect(load,[contentId]);
 const field=(key:'audience'|'learnerLevel'|'topic'|'purpose'|'openingLine',label:string)=><label>{label}<input value={value[key]} onChange={e=>setValue({...value,[key]:e.target.value})}/></label>;
 async function save(){setBusy(true);setMessage('');try{await sendJson('PUT',`/api/studio/memory/${contentId}`,{expectedVersion:version,requestId:crypto.randomUUID(),body:value});setMessage('Saved a new revision.');load();}catch(e){setMessage(String(e));}finally{setBusy(false);}}
 function updateAnnotation(id:string,change:Partial<Annotation>){setValue({...value,annotations:value.annotations.map(a=>a.id===id?{...a,...change}:a)});}
 return <details className="card studio"><summary>Creative memory · manual notes · revision {version}</summary>
 <p className="dim">Describe only what you have reviewed. These notes do not process or upload media. Changing the asset invalidates timestamp review.</p>
 <div className="studio-fields">{field('audience','Intended viewer')}{field('learnerLevel','Learner level')}{field('topic','Topic')}{field('purpose','Purpose')}{field('openingLine','Opening line')}
 <label>Spoken languages (comma separated)<input value={value.languageMix.join(', ')} onChange={e=>setValue({...value,languageMix:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})}/></label>
 {(['durationSeconds','firstPayoffSeconds','ctaSeconds'] as const).map(k=><label key={k}>{k==='durationSeconds'?'Duration (seconds)':k==='ctaSeconds'?'CTA time (seconds)':'First payoff (seconds)'}<input type="number" min="0" value={value[k]??''} onChange={e=>setValue({...value,[k]:e.target.value===''?null:Number(e.target.value)})}/></label>)}
 {(['writer','filmer','editor'] as const).map(k=><label key={k}>{k}<input value={value.contributors[k]} onChange={e=>setValue({...value,contributors:{...value.contributors,[k]:e.target.value}})}/></label>)}
 </div>
 <label><input type="checkbox" checked={!!value.asset} onChange={e=>setValue({...value,asset:e.target.checked?{url:'',version:'',fingerprint:'',approvedReference:true}:null})}/> I have an approved asset reference</label>
 {value.asset&&<div className="studio-fields">{(['url','version','fingerprint'] as const).map(k=><label key={k}>Asset {k}<input value={value.asset![k]} onChange={e=>setValue({...value,asset:{...value.asset!,[k]:e.target.value}})}/></label>)}</div>}
 <p className="dim">Use an immutable version link and a human-supplied fingerprint. The system does not inspect file contents.</p>
 <label>Reviewed content type<select value={value.classification.value} onChange={e=>setValue({...value,classification:{...value.classification,value:e.target.value as MemoryBody['classification']['value']}})}><option value="uncertain">Uncertain</option><option value="short">Short</option><option value="long">Long-form</option></select></label>
 <label>Classification source<input value={value.classification.source} onChange={e=>setValue({...value,classification:{...value.classification,source:e.target.value}})}/></label>
 <label><input type="checkbox" checked={value.classification.reviewed} onChange={e=>setValue({...value,classification:{...value.classification,reviewed:e.target.checked}})}/> I verified this classification (does not reclassify imported metrics)</label>
 <h3>Timestamped observations</h3>
 {value.annotations.map(a=><fieldset key={a.id}>
 <select aria-label="Observation kind" value={a.kind} onChange={e=>updateAnnotation(a.id,{kind:e.target.value as Annotation['kind']})}>{['transcript','scene','hook','payoff','cta','other'].map(k=><option key={k}>{k}</option>)}</select>
 <label>Start seconds<input type="number" min="0" value={a.startSeconds} onChange={e=>updateAnnotation(a.id,{startSeconds:Number(e.target.value)})}/></label><label>End seconds<input type="number" min="0" value={a.endSeconds} onChange={e=>updateAnnotation(a.id,{endSeconds:Number(e.target.value)})}/></label>
 <textarea aria-label="Observation" value={a.text} onChange={e=>updateAnnotation(a.id,{text:e.target.value,review:'draft'})}/>
 <label><input type="checkbox" checked={a.confidence==='uncertain'} onChange={e=>updateAnnotation(a.id,{confidence:e.target.checked?'uncertain':'observed'})}/> Uncertain observation</label>
 <label><input type="checkbox" checked={a.review==='reviewed'} onChange={e=>updateAnnotation(a.id,{review:e.target.checked?'reviewed':'draft'})}/> Human reviewed</label>
 {value.asset&&<a href={`${value.asset.url.split('#')[0]}#t=${a.startSeconds}`} target="_blank" rel="noreferrer">Open asset at {a.startSeconds}s (player support varies)</a>}
 <button type="button" onClick={()=>setValue({...value,annotations:value.annotations.filter(x=>x.id!==a.id)})}>Remove from this revision</button></fieldset>)}
 <button type="button" disabled={!value.asset} onClick={()=>setValue({...value,annotations:[...value.annotations,{id:crypto.randomUUID(),kind:'scene',startSeconds:0,endSeconds:0,text:'',confidence:'uncertain',review:'draft'}]})}>Add observation</button>
 <button type="button" disabled={busy} onClick={()=>void save()}>Save creative memory</button><p role="status">{message}</p>
 <details><summary>Revision history ({history.length}, latest 100)</summary>{history.map(r=><details key={r.version}><summary>v{r.version} · {r.updatedBy} · {new Date(r.updatedAt).toLocaleString()}</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(r.body,null,2)}</pre></details>)}</details>
 </details>;
}
