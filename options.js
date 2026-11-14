import {normalizeSettings} from './rules.js';
const $=id=>document.getElementById(id);
const flags=['reload','showBadge','blockScripts','blockInline','blockFrames','blockObjects','blockWorkers'];
let sites={},baseline='',dirty=false,temporaryDirty=false;
async function send(message){
  const result=await chrome.runtime.sendMessage(message);
  if(result?.error)throw new Error(result.error);
  if(!result)throw new Error('The extension did not respond.');
  return result.data;
}
function notify(text,error=false){$('status').textContent=text;$('status').dataset.error=String(error);}
function form(){
  const settings={sites,allowed:$('domains').value.split(/\r?\n/),blocked:$('blocked').value.split(/\r?\n/),mode:$('mode').value};
  for(const key of flags)settings[key]=$(key).checked;
  return settings;
}
function track(){
  dirty=JSON.stringify(form())!==baseline;
  $('dirty').textContent=dirty?'Unsaved changes':'All changes saved';$('save').disabled=!dirty;
  for(const [id,count]of [['domains','allowedCount'],['blocked','blockedCount']])$(count).textContent=`${$(id).value.split(/\r?\n/).filter(s=>s.trim()).length} domains`;
}
function displaySession(state){
  if(!temporaryDirty)$('temporaryDomains').value=state.temporary.join('\n');
  $('temporary').replaceChildren();
  if(!state.temporary.length)$('temporary').textContent='No temporary grants.';
  for(const domain of state.temporary){
    const tag=document.createElement('span');tag.className='session-tag';tag.append(document.createTextNode(domain));
    const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label',`Revoke session grant for ${domain}`);
    remove.addEventListener('click',()=>run(async()=>displaySession(await send({type:'revoke-temporary',domain}))));tag.append(remove);$('temporary').append(tag);
  }
  $('revoke').disabled=!state.temporary.length;
}
function display(state){
  sites=state.sites || {};
  $('domains').value=state.allowed.join('\n');$('blocked').value=state.blocked.join('\n');$('mode').value=state.mode;
  for(const key of flags)$(key).checked=state[key];
  displaySession(state);
  displaySync(state.sync);
  $('wotUser').value=state.wot.userId;$('wotAutomatic').checked=state.wot.automatic;
  $('wotState').textContent=state.wot.configured?'Credentials saved. Check a domain in the popup to test them.':'No complete credentials saved. Scorecard links still work.';
  $('wotKey').value='';
  $('warnings').textContent=state.migrationWarnings.length?'Some legacy entries could not be migrated: '+state.migrationWarnings.join(', '):'';
  baseline=JSON.stringify(form());track();
}
async function run(task){try{await task();notify('Saved. Reload affected pages to apply document policies.');}catch(error){notify(error.message,true);}}
for(const id of ['domains','blocked','mode',...flags])$(id).addEventListener('input',track);
$('save').addEventListener('click',()=>run(async()=>display(await send({type:'save',settings:form()}))));
$('revoke').addEventListener('click',()=>run(async()=>displaySession(await send({type:'revoke-temporary'}))));
$('export').addEventListener('click',()=>run(async()=>{
  const state=await send({type:'state'});
  const url=URL.createObjectURL(new Blob([JSON.stringify(normalizeSettings(state),null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='total-script-blocker-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}));
$('importLabel').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();$('import').click();}});
$('import').addEventListener('change',()=>run(async()=>{
  const file=$('import').files[0];if(!file)return;
  if(dirty&&!confirm('Replace your unsaved blocking settings with this file?'))return;
  if(file.size>1000000)throw new Error('Settings file is too large.');
  const data=JSON.parse(await file.text());
  if(!Array.isArray(data.allowed))throw new Error('Expected an allowed array.');
  display(await send({type:'save',settings:normalizeSettings(data)}));
}));
$('wotSave').addEventListener('click',()=>run(async()=>{
  const state=await send({type:'wot-config',userId:$('wotUser').value,apiKey:$('wotKey').value,automatic:$('wotAutomatic').checked});
  $('wotKey').value='';$('wotState').textContent=state.wot.configured?'Credentials saved. Check a domain in the popup to test them.':'Enter both a WOT user ID and API key.';
}));
$('wotClear').addEventListener('click',()=>run(async()=>{await send({type:'wot-config',clear:true});$('wotKey').value='';$('wotUser').value='';$('wotAutomatic').checked=false;$('wotState').textContent='Credentials removed.';}));
$('reset').addEventListener('click',()=>{if(confirm('Reset all blocking settings and domain rules to the trust-required defaults? WOT credentials are kept. Export your rules first if you want a backup.'))void run(async()=>display(await send({type:'reset-rules'})));});
window.addEventListener('beforeunload',event=>{if(dirty||temporaryDirty){event.preventDefault();event.returnValue='';}});


function displaySync(sync){
  if(!sync)return;
  $('syncStatus').textContent=`${sync.enabled?'Enabled':'Off on this device'} · ${(sync.bytes/1024).toFixed(1)} KB / 100 KB. ${sync.error || (sync.lastSuccess?'Last processed '+new Date(sync.lastSuccess).toLocaleString()+'. Chrome handles delivery to other devices.':'Choose a saved copy to begin.')}`;
  $('syncNow').disabled=!sync.enabled;$('syncDisable').disabled=!sync.enabled;$('syncRestore').disabled=!sync.backup;
}
$('temporaryDomains').addEventListener('input',()=>{temporaryDirty=true;});
$('temporarySave').addEventListener('click',()=>run(async()=>{
  const state=await send({type:'save-temporary',domains:$('temporaryDomains').value.split(/\r?\n/)});
  temporaryDirty=false;displaySession(state);
}));
$('reloadExtension').addEventListener('click',()=>{
  if(confirm('Reload the extension? Unsaved edits, temporary grants and pause state will be cleared.')){dirty=false;temporaryDirty=false;chrome.runtime.reload();}
});
for(const [id,message]of [['syncEnable',()=>({type:'sync-config',source:$('syncSource').value})],['syncNow',()=>({type:'sync-now'})],['syncDisable',()=>({type:'sync-config',source:'off'})],['syncRestore',()=>({type:'sync-restore'})]]){
  $(id).addEventListener('click',()=>run(async()=>{
    if(id==='syncEnable'&&!confirm('Use the selected saved copy for Chrome Sync? The other saved settings will be replaced. Unsaved edits are not included.'))return;
    if(id==='syncRestore'&&!confirm('Restore the settings saved before the last incoming sync and turn off sync on this device?'))return;
    const state=await send(message());
    if(!dirty)display(state);else displaySync(state.sync);
  }));
}
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='local'&&(changes.syncConfig||changes.settings))void send({type:'state'}).then(state=>{
    displaySync(state.sync);
    if(changes.settings){if(!dirty){
      sites=state.sites || {};
      $('domains').value=state.allowed.join('\n');$('blocked').value=state.blocked.join('\n');$('mode').value=state.mode;
      for(const key of flags)$(key).checked=state[key];
      baseline=JSON.stringify(form());track();
    }else notify('Saved settings changed elsewhere. Your unsaved edits are kept; saving will replace the saved copy.');}
  }).catch(error=>notify(error.message,true));
});

try{display(await send({type:'state'}));}catch(error){notify(error.message,true);}finally{document.body.inert=false;}
