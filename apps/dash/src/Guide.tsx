import { useRef } from 'react';
import type { BrainView } from '@platform/shared';
import { GUIDES, type AreaGuide } from './guides.js';
const SECTIONS: Array<[keyof Omit<AreaGuide,'title'>,string]> = [
  ['purpose','What this does'],['inputs','What goes in'],['outputs','What comes out'],['source','Where the data comes from'],
  ['ai','What the AI does'],['limits','What it cannot tell you'],['approval','Human approval'],['good','What good looks like'],['failures','Common failure modes'],['next','What happens next'],
];
export function Guide({ area }: { area: BrainView }) {
  const dialog = useRef<HTMLDialogElement>(null), guide = GUIDES[area];
  return <><button className="btn guide-trigger" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog"><span aria-hidden="true">?</span> How this works</button>
    <dialog ref={dialog} className="guide-dialog" aria-labelledby={'guide-title-'+area} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}>
      <div className="guide-content"><div className="guide-heading"><div><span className="eyebrow">WORKSPACE GUIDE</span><h2 id={'guide-title-'+area}>{guide.title}</h2></div><button className="btn" onClick={()=>dialog.current?.close()} aria-label="Close guide">×</button></div>
      <dl>{SECTIONS.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{guide[key]}</dd></div>)}</dl>
      <button className="btn primary" onClick={()=>dialog.current?.close()}>Got it</button></div>
    </dialog></>;
}
