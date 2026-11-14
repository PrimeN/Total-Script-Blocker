import {normalizeDomains, normalizeSettings, buildRules, domainPermission} from './rules.js';
import {mergeSources, sourceHost, scanDocument} from './discovery.js';
import {fetchRating} from './reputation.js';
import {editPermissions} from './permissions.js';
let queue = Promise.resolve();
const lookups = new Map();
function serialize(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}
const reportError = error => console.error('Total Script Blocker:',error.message);
async function migrate() {
  const stored = await chrome.storage.local.get('settings');
  if (stored.settings) return normalizeSettings(stored.settings);
  const contexts = await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']});
  if (!contexts.length) await chrome.offscreen.createDocument({url:'migration.html',reasons:['LOCAL_STORAGE'],justification:'Migrate the Manifest V2 allowlist and preferences once.'});
  let legacy;
  try { legacy = await chrome.runtime.sendMessage({target:'migration'}); }
  finally { await chrome.offscreen.closeDocument(); }
  const rejected = [];
  const clean = values => (Array.isArray(values) ? values : []).flatMap(value => {
    try { return normalizeDomains([value]); } catch { rejected.push(String(value));return []; }
  }).slice(0,500);
  const settings = normalizeSettings({allowed:clean(legacy?.whitelist),blocked:clean(legacy?.blacklist),reload:legacy?.reload !== false,showBadge:legacy?.showBadge !== false});
  await chrome.storage.local.set({settings,legacyBackup:legacy || {},migrationWarnings:rejected});
  return settings;
}
async function state() {
  const settings = await migrate();
  const {temporary = [], paused = false} = await chrome.storage.session.get(['temporary','paused']);
  return {...settings,temporary:normalizeDomains(temporary),paused};
}
async function publicState(next) {
  const {wotConfig = {}, migrationWarnings = []} = await chrome.storage.local.get(['wotConfig','migrationWarnings']);
  return {...next,wot:{configured:!!(wotConfig.apiKey && wotConfig.userId),automatic:!!wotConfig.automatic,userId:wotConfig.userId || ''},migrationWarnings};
}
async function badge(next, tabId) {
  const details = Number.isInteger(tabId) ? {tabId} : {};
  let text = next.paused ? 'OFF' : 'ON';
  if (Number.isInteger(tabId) && !next.paused) {
    const {sources = []} = (await chrome.storage.session.get(`sources:${tabId}`))[`sources:${tabId}`] || {};
    const count=sources.filter(s=>domainPermission(s.domain,next)==='blocked' && s.types.some(t=>['document','inline','script'].includes(t) ? (t==='inline' ? next.blockInline : t==='script' ? next.blockScripts : next.blockScripts || next.blockInline) : t==='frame' ? next.blockFrames : t==='object' ? next.blockObjects : next.blockWorkers)).length;
    text = count ? String(count) : '';
  }
  const mode=next.paused ? 'Paused' : 'Protection on';
  const sources=Number.isInteger(tabId) ? ((await chrome.storage.session.get(`sources:${tabId}`))[`sources:${tabId}`] || {}).sources || [] : [];
  const temporary=sources.some(s=>domainPermission(s.domain,next)==='temporary');
  const restricted=sources.some(s=>domainPermission(s.domain,next)==='blocked');
  const path=next.paused ? 'img/disabled.png' : temporary ? 'img/temp.png' : restricted || !sources.length ? 'img/forbidden.png' : 'img/allowed.png';
  await chrome.action.setIcon({...details,path});
  await chrome.action.setTitle({...details,title:`Total Script Blocker · ${mode}${text && text!=='ON' && text!=='OFF' ? ' · '+text+' restricted domains' : ''}`});
  await chrome.action.setBadgeText({...details,text:next.showBadge ? text : ''});
  await chrome.action.setBadgeBackgroundColor({...details,color:next.paused ? '#6b7280' : '#315b45'});
}
async function apply(next) {
  const addRules = buildRules([...next.allowed,...next.temporary],next.paused,next);
  const old = await chrome.declarativeNetRequest.getSessionRules();
  await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:old.map(r=>r.id),addRules});
  await badge(next);
  for (const tab of await chrome.tabs.query({})) if (Number.isInteger(tab.id)) await badge(next,tab.id).catch(()=>{});
}
async function recordSources(tabId,incoming) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  const key=`sources:${tabId}`;
  const data=(await chrome.storage.session.get(key))[key] || {};
  data.sources=mergeSources(data.sources,Array.isArray(incoming) ? incoming : []);
  await chrome.storage.session.set({[key]:data});
  await badge(await state(),tabId).catch(()=>{});
}
async function sourcesForTab(tabId,scan=true) {
  if (!Number.isInteger(tabId) || tabId < 0) throw new Error('No active tab.');
  if(scan)try {
    const frames=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:scanDocument});
    await recordSources(tabId,frames.flatMap(frame=>Array.isArray(frame.result) ? frame.result : []));
  } catch { /* Restricted/browser pages do not permit inspection. */ }
  return ((await chrome.storage.session.get(`sources:${tabId}`))[`sources:${tabId}`] || {}).sources || [];
}
async function handle(message) {
  let next = message.type==='reset-rules' ? {...normalizeSettings(),temporary:[],paused:false} : await state();
  if (message.type === 'sources') return {sources:await sourcesForTab(message.tabId,message.scan!==false),state:await publicState(next)};
  if (message.type === 'wot-config') {
    const {wotConfig:previous = {}}=await chrome.storage.local.get('wotConfig');
    const text=(value,max)=>typeof value==='string' && value.length<=max && !/[\r\n]/.test(value) ? value.trim() : '';
    const config=message.clear ? {} : {userId:text(message.userId,200),apiKey:message.apiKey ? text(message.apiKey,1000) : previous.apiKey || '',automatic:message.automatic===true,version:Date.now()};
    await chrome.storage.local.set({wotConfig:config});
    return publicState(next);
  }
  if (message.type === 'clear-site-data') {
    const tab=await chrome.tabs.get(message.tabId);
    const url=new URL(tab.url);
    if (!['http:','https:'].includes(url.protocol)) throw new Error('Only HTTP/HTTPS sites can be cleared.');
    // Session storage belongs to a live tab and is not cleared by browsingData.
    await chrome.scripting.executeScript({target:{tabId:message.tabId},func:origin=>{if(location.origin===origin)sessionStorage.clear();},args:[url.origin]});
    await chrome.browsingData.remove({origins:[url.origin]},{localStorage:true,indexedDB:true,cacheStorage:true,serviceWorkers:true});
    await chrome.tabs.reload(message.tabId);
    return publicState(next);
  }
  if (message.type === 'save') next={...normalizeSettings({...next,...message.settings,...(message.allowed ? {allowed:message.allowed,reload:message.reload} : {})}),temporary:next.temporary,paused:next.paused};
  else if (message.type === 'permissions-batch') next=editPermissions(next,message.changes);
  else if (message.type === 'permission') {
    const domains=normalizeDomains(message.domains || [message.domain]);
    if (!domains.length) throw new Error('Choose a valid domain.');
    next=editPermissions(next,domains.map(domain=>({domain,mode:message.mode})));
  } else if (message.type === 'pause') next.paused=!next.paused;
  else if (message.type === 'revoke-temporary') next.temporary=message.domain ? next.temporary.filter(d=>d!==normalizeDomains([message.domain])[0]) : [];
  else if (message.type === 'reset-rules') next={...normalizeSettings(),temporary:[],paused:false};
  else if (message.type !== 'state') throw new Error('Unknown request.');
  await apply(next);
  if (message.type !== 'state') {
    await chrome.storage.local.set({settings:normalizeSettings(next)});
    await chrome.storage.session.set({temporary:next.temporary,paused:next.paused});
    if ((typeof message.reload === 'boolean' ? message.reload : next.reload) && Number.isInteger(message.tabId)) await chrome.tabs.reload(message.tabId);
  }
  return publicState(next);
}
async function rating(domain) {
  [domain]=normalizeDomains([domain]);
  if (!domain) throw new Error('Choose a valid domain.');
  const {wotConfig = {}}=await chrome.storage.local.get('wotConfig');
  if (!wotConfig.apiKey || !wotConfig.userId) throw new Error('Set your WOT user ID and API key in Options, or open the WOT scorecard.');
  const key=`wot:${domain}`,cached=(await chrome.storage.session.get(key))[key];
  if (cached?.version === wotConfig.version && Date.now()-cached.rating.checkedAt < 30*60*1000) return cached.rating;
  if (!lookups.has(domain)) {
    if (lookups.size>=5) throw new Error('Too many WOT lookups; try again shortly.');
    const pending=(async()=>{
      const result=await fetchRating(domain,wotConfig);
      await chrome.storage.session.set({[key]:{version:wotConfig.version,rating:result}});
      return result;
    })().finally(()=>lookups.delete(domain));
    lookups.set(domain,pending);
  }
  return lookups.get(domain);
}
chrome.runtime.onMessage.addListener((message,sender,respond) => {
  if (!message || message.target === 'migration') return false;
  if (sender.id !== chrome.runtime.id) return false;
  if (message.type === 'source-report' && sender.tab && Array.isArray(message.sources)) {
    serialize(async()=>{
      const frame=await chrome.webNavigation.getFrame({tabId:sender.tab.id,frameId:sender.frameId});
      if (sender.documentId && frame?.documentId !== sender.documentId) return;
      await recordSources(sender.tab.id,message.sources);
    }).then(()=>respond({data:true}),error=>respond({error:error.message}));
    return true;
  }
  // Content scripts can report observations, but cannot mutate permissions or query WOT.
  if (!sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  const task=message.type === 'wot-rating' ? rating(message.domain) : serialize(()=>handle(message));
  task.then(data=>respond({data}),error=>respond({error:error.message}));
  return true;
});
const filter={urls:['http://*/*','https://*/*'],types:['main_frame','script','sub_frame','object']};
function observation(details,evidence) {
  if (details.tabId<0) return;
  const domain=sourceHost(details.url);
  if (!domain) return;
  const type=({main_frame:'document',sub_frame:'frame'})[details.type] || details.type;
  serialize(()=>recordSources(details.tabId,[{domain,types:[type],evidence:[evidence]}])).catch(reportError);
}
chrome.webRequest.onBeforeRequest.addListener(details=>observation(details,'request'),filter);
chrome.webRequest.onCompleted.addListener(details=>observation(details,'completed'),filter);
chrome.webRequest.onErrorOccurred.addListener(details=>{
  if (details.error?.includes('BLOCKED')) observation(details,'browser-blocked');
},filter);
chrome.webNavigation.onBeforeNavigate.addListener(details=>{
  if (details.frameId===0) serialize(()=>chrome.storage.session.remove(`sources:${details.tabId}`)).catch(reportError);
});
chrome.tabs.onRemoved.addListener(tabId=>serialize(()=>chrome.storage.session.remove(`sources:${tabId}`)).catch(reportError));
chrome.tabs.onActivated.addListener(({tabId})=>serialize(async()=>badge(await state(),tabId)).catch(reportError));
async function initialize() {
  // Keep keys and settings out of content-script storage access.
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await apply(await state());
}
chrome.runtime.onInstalled.addListener(()=>serialize(initialize).catch(reportError));
chrome.runtime.onStartup.addListener(()=>serialize(initialize).catch(reportError));
