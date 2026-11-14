chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if (message.target!=='migration' || sender.id!==chrome.runtime.id) return;
  const get=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));}catch{return fallback;}};
  respond({whitelist:get('whitelist',[]),blacklist:get('blacklist',[]),reload:get('reloadCurrentTabOnToggle',true),showBadge:get('showPageActionButton',true)});
});
