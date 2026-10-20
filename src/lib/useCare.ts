import { useSyncExternalStore, type SetStateAction } from 'react';
import { careStorageKey, emptyCare, loadCare, type CareData } from './clinical';
import { useSession, useSyncedState } from './Session';
let cached:CareData=emptyCare;
let serialized:string|null|undefined;
const listeners=new Set<()=>void>();
function snapshot(){let raw:string|null;try{raw=localStorage.getItem(careStorageKey);}catch{return cached;}if(raw!==serialized){serialized=raw;cached=loadCare();}return cached;}
function subscribe(listener:()=>void){listeners.add(listener);const changed=(e:StorageEvent)=>{if(e.key===careStorageKey||e.key===null)listener();};window.addEventListener('storage',changed);return()=>{listeners.delete(listener);window.removeEventListener('storage',changed);};}
export function useCare(){
 const {store}=useSession();const [remote,setRemote]=useSyncedState<CareData>('care',loadCare);const guest=useSyncExternalStore(subscribe,snapshot,snapshot);
 async function setCare(action:SetStateAction<CareData>){if(store){await setRemote(action);return;}const value=typeof action==='function'?action(snapshot()):action;const raw=JSON.stringify(value);localStorage.setItem(careStorageKey,raw);serialized=raw;cached=value;for(const listener of listeners)listener();}
 return {care:store?remote:guest,setCare,error:''};
}
