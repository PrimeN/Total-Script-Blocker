import {domainPermission,normalizeDomains} from './rules.js';
import {explicitPermission} from './permissions.js';
import {scorecardURL} from './reputation.js';
const $=id=>document.getElementById(id);
let toastTimer;
let tab,host='',current,sources=[],lastRender='',refreshing=false,filterMode='all',applying=false,initialized=false;
const selected=new Set(),drafts=new Map(),ratings=new Map(),pending=new Set();
const labels={blocked:'Restricted',allowed:'Trusted',temporary:'Session grant',paused:'Paused','same-origin':'Origin policy'};
const manageable=domain=>{try{return normalizeDomains([domain])[0]===domain;}catch{return false;}};
function notify(text,error=false){clearTimeout(toastTimer);$('status').textContent=text;$('status').dataset.error=String(error);if(text&&!error)toastTimer=setTimeout(()=>{$('status').textContent='';},5000);}
async function send(message){
  const result=await chrome.runtime.sendMessage({...message,tabId:tab?.id});
  if(result?.error)throw new Error(result.error);
  if(!result)throw new Error('The extension did not respond.');
  return result.data;
}
function showState(state){
  current=state;
  $('pause').textContent=state.paused?'Resume':'Pause';
  $('pause').setAttribute('aria-label',state.paused?'Resume protection':'Pause protection for this browser session');
  $('protection').textContent=state.paused?'Protection paused':'Protection on';
  $('protection').className='pill '+(state.paused?'paused':'allowed');
  const mode={whitelist:'Trust required','same-origin':'Same-origin policy',blacklist:'Blocklist policy'}[state.mode];
  $('summary').textContent=state.paused?'Paused across tabs until you resume or this browser session ends.':`${mode} · Across tabs`;
  if(!initialized){$('reloadToggle').checked=state.reload;initialized=true;}
}
async function refresh(force=false){
  if(refreshing||!tab||applying)return;
  refreshing=true;
  try{
    const latest=await chrome.tabs.get(tab.id);
    let nextHost='';try{const url=new URL(latest.url);if(['http:','https:'].includes(url.protocol))nextHost=url.hostname;}catch{}
    if(host && host!==nextHost){drafts.clear();selected.clear();notify('Website changed. Pending edits were discarded.');}
    host=nextHost;
    $('site').textContent=host||'Browser page';
    for(const id of ['allow','temporary','block','default','clear'])$(id).disabled=!host||!manageable(host);
    const data=await send({type:'sources',scan:force||!initialized});showState(data.state);sources=data.sources;
    for(const domain of selected)if(!sources.some(s=>s.domain===domain))selected.delete(domain);
    render(force);
  }catch(error){notify(error.message,true);}
  finally{refreshing=false;}
}
function visibleSources(){
  const search=$('filter').value.trim().toLowerCase();
  return sources.filter(source=>{
    const permission=domainPermission(source.domain,current);
    return source.domain.includes(search)&&(filterMode==='all'||(filterMode==='trusted'?['allowed','temporary'].includes(permission):permission===filterMode));
  }).sort((a,b)=>Number(b.domain===host)-Number(a.domain===host)||Number(domainPermission(b.domain,current)==='blocked')-Number(domainPermission(a.domain,current)==='blocked')||a.domain.localeCompare(b.domain));
}
function updateControls(){
  const visible=visibleSources().filter(s=>manageable(s.domain));
  const checked=visible.filter(s=>selected.has(s.domain)).length;
  $('selectAll').checked=visible.length>0&&checked===visible.length;
  $('selectAll').indeterminate=checked>0&&checked<visible.length;
  $('selectAll').disabled=!visible.length;
  $('selectedCount').textContent=selected.size?`${selected.size} selected`:'Select visible';
  for(const id of ['bulkAllow','bulkTemp','bulkBlock'])$(id).disabled=!selected.size||applying;
  $('pendingCount').textContent=drafts.size?`${drafts.size} pending ${drafts.size===1?'change':'changes'}`:'No pending changes';
  $('pendingHint').textContent=drafts.size?'Review your choices before applying.':'Choose permissions, then apply once.';
  $('apply').textContent=applying?'Applying…':'Apply changes';
  $('apply').disabled=!drafts.size||applying;$('discard').disabled=!drafts.size||applying;
}
function stage(domain,mode){
  if(!manageable(domain)){notify('This address cannot be used in a domain rule.',true);return;}
  drafts.set(domain,mode);notify('Changes staged. Apply when you are ready.');render(true);
}
function render(force=false){
  if(!current)return;
  const visible=visibleSources();
  const signature=JSON.stringify([visible,current,[...ratings],[...drafts],filterMode]);
  updateControls();
  if(!force&&signature===lastRender)return;
  if(!force&&$('sources').contains(document.activeElement))return;
  lastRender=signature;
  const focus=document.activeElement?.dataset.key;
  const opened=new Set([...$('sources').querySelectorAll('details[open]')].map(el=>el.dataset.domain));
  const scroll=document.querySelector('.popup-main').scrollTop;
  $('sources').replaceChildren();$('count').textContent=`${sources.length}${sources.length>=300?' · limit reached':''}`;
  $('restrictedCount').textContent=sources.filter(s=>domainPermission(s.domain,current)==='blocked').length;
  $('trustedCount').textContent=sources.filter(s=>['allowed','temporary'].includes(domainPermission(s.domain,current))).length;
  $('sessionCount').textContent=current.temporary.length;
  for(const source of visible){
    const permission=domainPermission(source.domain,current),canManage=manageable(source.domain);
    const row=document.createElement('article');row.className='source'+(drafts.has(source.domain)?' pending':'');
    const top=document.createElement('div');top.className='source-top';
    const label=document.createElement('label');label.className='source-name';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(source.domain);checkbox.disabled=!canManage;
    checkbox.addEventListener('change',()=>{if(checkbox.checked)selected.add(source.domain);else selected.delete(source.domain);updateControls();});
    const name=document.createElement('span');name.textContent=source.domain;label.append(checkbox,name);top.append(label);
    const badge=document.createElement('span');badge.className='pill '+permission;badge.textContent=labels[permission];top.append(badge);row.append(top);
    const controls=document.createElement('div');controls.className='source-controls';
    const select=document.createElement('select');select.setAttribute('aria-label',`Permission for ${source.domain}`);select.dataset.key=source.domain;
    for(const [value,title] of [['default','Inherit policy'],['allow','Always trust'],['temporary','Trust for session'],['block','Block domain']]){const option=document.createElement('option');option.value=value;option.textContent=title;select.append(option);}
    select.value=drafts.get(source.domain)||explicitPermission(source.domain,current);select.disabled=!canManage||applying;
    select.addEventListener('change',()=>stage(source.domain,select.value));controls.append(select);
    const details=document.createElement('details');details.dataset.domain=source.domain;details.open=opened.has(source.domain);
    const summary=document.createElement('summary');summary.textContent=drafts.has(source.domain)?'Pending change · details':'Details & reputation';details.append(summary);
    const detailBody=document.createElement('div');
    const evidence=document.createElement('p');evidence.className='hint';evidence.textContent=`${source.types.join(', ')} · ${source.evidence.map(e=>({page:'declared in page',request:'request observed',completed:'response completed','browser-blocked':'browser blocked','csp-blocked':'CSP blocked'})[e]).join(', ')}`;detailBody.append(evidence);
    const actions=document.createElement('div');actions.className='actions';
    if(canManage){
      const link=document.createElement('a');link.textContent='WOT scorecard';link.href=scorecardURL(source.domain);link.target='_blank';link.rel='noopener noreferrer';actions.append(link);
      const lookup=document.createElement('button');lookup.textContent=pending.has(source.domain)?'Checking WOT…':'Check WOT';lookup.disabled=pending.has(source.domain);lookup.addEventListener('click',()=>checkRating(source.domain));actions.append(lookup);
    }
    detailBody.append(actions);
    const rating=document.createElement('p');rating.className='rating';rating.textContent=canManage?ratings.get(source.domain)||'WOT: not checked. Lookups send this domain to WOT.':'IPv6 address rules are not supported in this version.';detailBody.append(rating);
    details.append(detailBody);controls.append(details);row.append(controls);$('sources').append(row);
  }
  if(!visible.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent=sources.length?'No domains match these filters.':'No domains found. Reload a website or rescan to start discovery.';$('sources').append(empty);}
  if(focus)$('sources').querySelector(`[data-key="${CSS.escape(focus)}"]`)?.focus({preventScroll:true});
  document.querySelector('.popup-main').scrollTop=scroll;
  if(current.wot.automatic&&current.wot.configured)for(const source of visible.slice(0,20))if(manageable(source.domain)&&pending.size<3&&!ratings.has(source.domain)&&!pending.has(source.domain))void checkRating(source.domain);
}
async function checkRating(domain){
  if(pending.has(domain))return;
  pending.add(domain);notify('');render(true);
  try{
    const r=await send({type:'wot-rating',domain});
    ratings.set(domain,`WOT: ${r.status.replaceAll('_',' ')} · safety ${r.score===null?'unrated':r.score+'/100'} · confidence ${r.confidence===null?'unknown':r.confidence+'/100'}${r.childScore===null?'':' · child safety '+r.childScore+'/100'}${r.categories.length?' · '+r.categories.map(c=>c.name).join(', '):''}`);
  }catch(error){ratings.set(domain,'WOT unavailable: '+error.message);}
  finally{pending.delete(domain);render(true);}
}
async function run(message){
  try{showState(await send(message));notify('Saved. Reload other affected tabs to apply document policies.');await refresh(true);}
  catch(error){notify(error.message,true);}
}
$('apply').addEventListener('click',async()=>{
  if(applying||!drafts.size)return;applying=true;updateControls();
  try{
    showState(await send({type:'permissions-batch',changes:[...drafts].map(([domain,mode])=>({domain,mode})),reload:$('reloadToggle').checked}));
    drafts.clear();notify('Saved. Other open tabs may need a reload.');
  }catch(error){notify(error.message,true);}
  finally{applying=false;await refresh(true);}
});
$('discard').addEventListener('click',()=>{drafts.clear();notify('Pending changes discarded.');render(true);});
for(const mode of ['allow','temporary','block','default'])$(mode).addEventListener('click',()=>stage(host,mode));
for(const [id,mode]of [['bulkAllow','allow'],['bulkTemp','temporary'],['bulkBlock','block']])$(id).addEventListener('click',()=>{for(const domain of selected)drafts.set(domain,mode);notify('Selected permissions staged. Apply when ready.');render(true);});
$('selectAll').addEventListener('change',()=>{for(const source of visibleSources().filter(s=>manageable(s.domain)))if($('selectAll').checked)selected.add(source.domain);else selected.delete(source.domain);render(true);});
$('filter').addEventListener('input',()=>render(true));
for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{filterMode=button.dataset.filter;for(const other of document.querySelectorAll('[data-filter]'))other.setAttribute('aria-pressed',String(other===button));render(true);});
$('customAllow').addEventListener('click',()=>{try{stage(normalizeDomains([$('domain').value])[0],'allow');}catch(error){notify(error.message,true);}});
$('customTemp').addEventListener('click',()=>{try{stage(normalizeDomains([$('domain').value])[0],'temporary');}catch(error){notify(error.message,true);}});
$('pause').addEventListener('click',()=>run({type:'pause'}));
$('revoke').addEventListener('click',()=>run({type:'revoke-temporary'}));
$('options').addEventListener('click',()=>chrome.runtime.openOptionsPage());
$('refresh').addEventListener('click',()=>refresh(true));
$('clear').addEventListener('click',()=>{if(confirm(`Clear local/session storage, IndexedDB, cached app data and service workers for ${host}? Cookies are retained. This cannot be undone.`))void run({type:'clear-site-data'});});
try{[tab]=await chrome.tabs.query({active:true,currentWindow:true});await refresh(true);}catch(error){notify(error.message,true);}
setInterval(()=>void refresh(),2000);
