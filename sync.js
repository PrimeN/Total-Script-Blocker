import {normalizeSettings} from './rules.js';
const HEAD='tsb.sync.head', PREFIX='tsb.sync.part.', ALARM='tsb-sync';
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
export async function encodeSnapshot(settings,revision=crypto.randomUUID()) {
  const text=JSON.stringify(normalizeSettings(settings));
  if(bytes(text)>90000)throw new Error('These rules exceed Chrome Sync capacity. Local protection is unchanged. Export a backup or reduce the lists.');
  const chunks=[];let chunk='';
  for(const char of text){if(bytes(chunk+char)>6000){chunks.push(chunk);chunk='';}chunk+=char;}
  chunks.push(chunk);
  const head={version:1,revision,count:chunks.length,hash:await digest(text)};
  return {head,parts:Object.fromEntries(chunks.map((data,i)=>[PREFIX+i,{revision,data}]))};
}
export async function decodeSnapshot(data) {
  const head=data[HEAD];
  if(!head)return null;
  if(head.version!==1 || typeof head.revision!=='string' || !Number.isInteger(head.count) || head.count<1 || head.count>16)throw new Error('Unsupported or invalid synced settings.');
  let text='';
  for(let i=0;i<head.count;i++){
    const part=data[PREFIX+i];
    if(part?.revision!==head.revision || typeof part.data!=='string')throw new Error('Waiting for all synced settings to arrive.');
    text+=part.data;
  }
  if(text.length>90000 || await digest(text)!==head.hash)throw new Error('Synced settings are incomplete. Keeping local rules.');
  const parsed=JSON.parse(text);
  if(!Array.isArray(parsed.allowed)||!Array.isArray(parsed.blocked))throw new Error('Invalid synced rule lists.');
  return {revision:head.revision,settings:normalizeSettings(parsed)};
}
export function createSync(api,applySettings) {
  const config=async()=> (await api.storage.local.get('syncConfig')).syncConfig || {enabled:false};
  const save=async value=>api.storage.local.set({syncConfig:value});
  const schedule=()=>api.alarms.create(ALARM,{delayInMinutes:0.5});
  async function status(){
    const value=await config();
    const {syncBackup}=await api.storage.local.get('syncBackup');
    return {enabled:!!value.enabled,pending:!!value.pending,conflict:!!value.conflict,error:value.error || '',lastSuccess:value.lastSuccess || null,backup:!!syncBackup,bytes:await api.storage.sync.getBytesInUse(null)};
  }
  async function accept(remote,value){
    const {settings}=await api.storage.local.get('settings');
    await api.storage.local.set({syncBackup:{settings:normalizeSettings(settings),savedAt:Date.now()}});
    await applySettings(remote.settings);
    await save({...value,lastRevision:remote.revision,pending:null,conflict:false,error:'',lastSuccess:Date.now()});
  }
  async function reconcile(){
    const value=await config();if(!value.enabled)return;
    try {
      const data=await api.storage.sync.get(null);
      const remote=value.pending ? data[HEAD] : await decodeSnapshot(data);
      if(value.pending){
        if(remote?.revision===value.pending.revision){
          await decodeSnapshot(data);
          await save({...value,pending:null,conflict:false,error:'',lastRevision:remote.revision,lastSuccess:Date.now()});return;
        }
        if((remote?.revision || null)!==(value.lastRevision || null)){
          await save({...value,conflict:true,error:'Settings changed on another device. Choose which saved copy to use.'});return;
        }
        const {settings}=await api.storage.local.get('settings');
        const snapshot=await encodeSnapshot(settings,value.pending.revision);
        // The manifest is published last; readers verify every part before applying.
        await api.storage.sync.set(snapshot.parts);
        await api.storage.sync.set({[HEAD]:snapshot.head});
        await save({...value,pending:null,conflict:false,error:'',lastRevision:snapshot.head.revision,lastSuccess:Date.now()});
      }else if(remote && remote.revision!==value.lastRevision)await accept(remote,value);
    }catch(error){await save({...value,error:error.message});await schedule();}
  }
  async function changed(){
    const value=await config();if(!value.enabled)return;
    await save({...value,pending:{revision:crypto.randomUUID()},error:value.conflict?value.error:'Waiting to upload saved changes.'});
    await schedule();
  }
  async function configure(source){
    const value=await config();
    if(source==='off'){await save({...value,enabled:false,pending:null,conflict:false,error:''});await api.alarms.clear(ALARM);return;}
    if(!['local','remote'].includes(source))throw new Error('Choose this device or the synced copy.');
    const data=await api.storage.sync.get(null);
    const remote=source==='remote' ? await decodeSnapshot(data) : data[HEAD];
    if(source==='remote'){
      if(!remote)throw new Error('No complete synced copy is available yet.');
      await accept(remote,{...value,enabled:true});
    }else{
      const {settings}=await api.storage.local.get('settings');
      await encodeSnapshot(settings);
      await save({...value,enabled:true,lastRevision:remote?.revision || null,pending:{revision:crypto.randomUUID()},conflict:false,error:''});
      await reconcile();
    }
  }
  async function restore(){
    const {syncBackup}=await api.storage.local.get('syncBackup');
    if(!syncBackup)throw new Error('No backup is available.');
    await configure('off');
    await applySettings(normalizeSettings(syncBackup.settings));
  }
  return {status,changed,configure,reconcile,restore,alarm:ALARM};
}
