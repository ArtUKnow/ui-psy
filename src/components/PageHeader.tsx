import type { ReactNode } from 'react';
import { GlassStar } from './Visuals';
import ContourField from './ContourField';
export type PageArt = 'journal'|'calendar'|'sleep'|'wellbeing'|'my-plan'|'time-for-self'|'star'|'none';
export default function PageHeader({title,description,art='star',action}:{title:string;description?:string;art?:PageArt;action?:ReactNode}){
 return <header className={`inner-page-heading designed-heading ${art==='none'?'no-art':''}`}><ContourField/><div className="designed-heading-copy"><h1>{title}</h1>{description&&<p>{description}</p>}</div>{art!=='none'&&<div className="designed-heading-art" aria-hidden="true">{art==='star'?<GlassStar value={7} hue={145} shape="petal" ambient/>:<img src={`/illustrations/${art}.webp`} alt="" width="256" height="256"/>}</div>}{action&&<div className="designed-heading-action">{action}</div>}</header>;
}
