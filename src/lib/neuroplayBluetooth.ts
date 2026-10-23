// Manufacturer protocol: https://neuroplay.ru/api-sdk/NeuroplayBluetoothAPI.html
export const EEG_SERVICE='f0001298-0451-4000-b000-000000000000';
export const EEG_DATA='f0001299-0451-4000-b000-000000000000';
export const EEG_CONTROL='f000129a-0451-4000-b000-000000000000';
export const EEG_CHANNELS=['O1','T3','Fp1','Fp2','T4','O2'] as const;
export const EEG_RATE=125;
const channelIndices=[0,2,3,4,5,7];
const MICROVOLTS=0.000186265;
export type EEGSample={time:number;values:number[]};
export type EEGRecording={id:string;createdAt:string;deviceName:string;sampleRate:number;sampleCount:number;duration:number;missingFrames:number;previewStride:number;preview:EEGSample[];interrupted:boolean};
export class NeuroplayDecoder {
 private frames:Uint8Array[]=[];private previous:number|null=null;private anchor:number|null=null;private elapsedFrames=0;
 sampleCount=0;missingFrames=0;invalidPackets=0;
 push(data:DataView):EEGSample[]{
  if(data.byteLength!==20){this.invalidPackets++;this.frames=[];return [];}
  const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength),number=bytes[0];
  if(this.previous===number){this.invalidPackets++;return [];}
  if(this.anchor===null)this.anchor=number;
  if(this.previous!==null&&number!==((this.previous+1)&255)){this.missingFrames+=(number-this.previous-1+256)%256;this.frames=[];}
  this.elapsedFrames+=this.previous===null?1:(number-this.previous+256)%256;
  this.previous=number;
  const position=(number-this.anchor+256)%4;
  if(position===0)this.frames=[];
  if(position!==this.frames.length)return [];
  this.frames.push(bytes.slice());
  if(this.frames.length!==4)return [];
  const values=this.frames.flatMap(frame=>Array.from({length:6},(_,i)=>{
   const offset=2+i*3;
   // The documented INT32 layout [00,A1,A2,A3] is a signed 24-bit value shifted left 8 bits.
   const signed=(frame[offset]<<24)|(frame[offset+1]<<16)|(frame[offset+2]<<8);
   return signed*MICROVOLTS;
  }));
  this.frames=[];
  const startSample=(this.elapsedFrames-4)*3/4;
  this.sampleCount+=3;
  return Array.from({length:3},(_,sample)=>({time:(startSample+sample)/EEG_RATE,values:channelIndices.map(channel=>values[sample*8+channel])}));
 }
}
export interface GattCharacteristic extends EventTarget {value?:DataView;startNotifications():Promise<GattCharacteristic>;stopNotifications():Promise<GattCharacteristic>;writeValue(value:Uint8Array):Promise<void>;}
export interface GattServer {connected:boolean;connect():Promise<GattServer>;disconnect():void;getPrimaryService(uuid:string):Promise<{getCharacteristic(uuid:string):Promise<GattCharacteristic>}>;}
export interface NeuroDevice extends EventTarget {name?:string;gatt?:GattServer;}
export type BluetoothBrowser=Navigator&{bluetooth?:{requestDevice(options:{filters:{services:string[]}[]}):Promise<NeuroDevice>}};
export class NeuroplayConnection {
 private device:NeuroDevice|null=null;private data:GattCharacteristic|null=null;private control:GattCharacteristic|null=null;
 private handler:EventListener|null=null;private disconnected:EventListener|null=null;
 async connect(onData:(data:DataView)=>void,onDisconnect:()=>void):Promise<string>{
  if(!window.isSecureContext)throw new Error('Для Bluetooth нужен HTTPS или localhost.');
  const bluetooth=(navigator as BluetoothBrowser).bluetooth;
  if(!bluetooth)throw new Error('Этот браузер не поддерживает Web Bluetooth. Открой UI-PSY в Chrome на компьютере или Android.');
  // Called directly from a click: the browser owns the chooser and user permission.
  this.device=await bluetooth.requestDevice({filters:[{services:[EEG_SERVICE]}]});
  if(!this.device.gatt)throw new Error('У выбранного устройства нет BLE GATT.');
  this.disconnected=()=>onDisconnect();this.device.addEventListener('gattserverdisconnected',this.disconnected);
  try{
   const server=await this.device.gatt.connect();const service=await server.getPrimaryService(EEG_SERVICE);
   this.data=await service.getCharacteristic(EEG_DATA);this.control=await service.getCharacteristic(EEG_CONTROL);
   this.handler=(event:Event)=>{const value=(event.target as GattCharacteristic).value;if(value)onData(value);};
   this.data.addEventListener('characteristicvaluechanged',this.handler);
   // startNotifications performs the browser-managed CCCD subscription described by the protocol.
   await this.data.startNotifications();await this.control.writeValue(new Uint8Array([1,1]));
   return this.device.name||'NeuroPlay';
  }catch(error){this.disconnect();throw error;}
 }
 async stop(){try{if(this.device?.gatt?.connected&&this.control)await this.control.writeValue(new Uint8Array([0,0]));if(this.device?.gatt?.connected&&this.data)await this.data.stopNotifications();}finally{this.disconnect();}}
 disconnect(){if(this.handler)this.data?.removeEventListener('characteristicvaluechanged',this.handler);if(this.disconnected)this.device?.removeEventListener('gattserverdisconnected',this.disconnected);if(this.device?.gatt?.connected)this.device.gatt.disconnect();this.device=null;this.data=null;this.control=null;this.handler=null;this.disconnected=null;}
}
