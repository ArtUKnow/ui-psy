import {useId} from 'react';
/** Decorative contour field, drawn natively so it stays crisp at any viewport. */
export default function ContourField({className=''}:{className?:string}){
 const id=useId().replace(/:/g,'');
 const paths=Array.from({length:20},(_,layer)=>{
  const radius=32+layer*11;
  const points=Array.from({length:120},(_,i)=>{const a=-Math.PI/2+i*Math.PI/60;const r=radius*(.82+.18*Math.cos(5*(a+Math.PI/2)+layer*.025));return `${(450+Math.cos(a)*r).toFixed(2)},${(140+Math.sin(a)*r*.85).toFixed(2)}`;});
  return `M${points.join(' L')}Z`;
 });
 return <svg className={`contour-field ${className}`} viewBox="0 0 650 280" fill="none" aria-hidden="true"><defs><radialGradient id={`contour-${id}`}><stop stopColor="#80cfff" stopOpacity=".22"/><stop offset="1" stopColor="#2880cb" stopOpacity="0"/></radialGradient></defs><ellipse cx="450" cy="140" rx="210" ry="160" fill={`url(#contour-${id})`}/>{paths.map((d,i)=><path key={i} d={d} stroke="#73bff5" strokeWidth={i<8?1.2:.65} opacity={.38-i*.014}/>)}{[[226,80],[340,34],[592,83],[545,227],[380,210]].map(([x,y],i)=><path key={i} d={`M${x} ${y-3}Q${x} ${y} ${x+3} ${y}Q${x} ${y} ${x} ${y+3}Q${x} ${y} ${x-3} ${y}Q${x} ${y} ${x} ${y-3}`} fill="#bbdff7" opacity=".65"/>)}</svg>;
}
export function ConceptMark(){return <svg width="30" height="36" viewBox="0 0 30 36" fill="none" aria-hidden="true"><path d="M15 1C15 11 20 16 29 18C20 20 15 25 15 35C15 25 10 20 1 18C10 16 15 11 15 1Z" fill="#afe3f7"/></svg>;}
