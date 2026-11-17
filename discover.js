// Runs in an isolated world, including frames whose page JavaScript is disabled.
(() => {
  if (globalThis.__totalScriptBlockerDiscovery) return;
  globalThis.__totalScriptBlockerDiscovery = true;
  const pending = new Map();
  let timer;
  const observed = new WeakMap();
  function add(value, type, evidence = 'page') {
    try {
      const url = new URL(value,document.baseURI);
      if (!['http:','https:'].includes(url.protocol)) return;
      const key = url.hostname + ':' + type + ':' + evidence;
      if (pending.size < 500) pending.set(key,{domain:url.hostname,types:[type],evidence:[evidence]});
      if (!timer) timer = setTimeout(flush,150);
    } catch {}
  }
  function flush() {
    timer = null;
    const sources = [...pending.values()]; pending.clear();
    if (sources.length) chrome.runtime.sendMessage({type:'source-report',sources}).catch(() => {});
  }
  function inspect(el) {
    if (!el.tagName) return;
    const tag = el.tagName;
    let value, type;
    if (tag === 'SCRIPT') {value=el.src || location.href;type=el.src ? 'script' : 'inline';}
    else if (tag === 'IFRAME' || tag === 'FRAME') {value=el.src || location.href;type='frame';}
    else if (tag === 'OBJECT' || tag === 'EMBED') {value=el.data || el.src;type='object';}
    else if (tag === 'LINK' && (el.rel === 'modulepreload' || (el.rel === 'preload' && el.as === 'script'))) {value=el.href;type='script';}
    else return;
    if (observed.get(el) === value) return;
    observed.set(el,value);add(value,type);
  }
  function walk(root) {
    inspect(root);
    for (const el of root.querySelectorAll?.('script,iframe,frame,object,embed,link') || []) inspect(el);
  }
  new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') inspect(mutation.target);
      else for (const node of mutation.addedNodes) walk(node);
    }
  }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['src','data','href','rel','as']});
  document.addEventListener('securitypolicyviolation',event => {
    if (!/^(script-src|frame-src|object-src|worker-src)/.test(event.effectiveDirective)) return;
    const type=event.effectiveDirective.startsWith('script') ? 'script' : event.effectiveDirective.split('-')[0];
    add(['inline','eval',''].includes(event.blockedURI) ? location.href : event.blockedURI,type,'csp-blocked');
  });
  window.addEventListener('pageshow',() => {add(location.href,'document');walk(document);});
  add(location.href,'document');walk(document);
})();
