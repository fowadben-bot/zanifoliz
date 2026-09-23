(()=>{'use strict';
const copy={
fr:{left:'Temps restant aujourd’hui',done:'Temps terminé pour aujourd’hui',body:'La limite choisie par ton parent est atteinte. Reviens demain ou demande à ton parent de modifier la limite.',parents:'Espace Parents'},
en:{left:'Time left today',done:'Time is up for today',body:'The limit chosen by your parent has been reached. Come back tomorrow or ask your parent to change it.',parents:'Parents Area'},
es:{left:'Tiempo restante hoy',done:'Tiempo terminado por hoy',body:'Has alcanzado el límite elegido por tu familia. Vuelve mañana o pide a tu padre o madre que lo cambie.',parents:'Espacio para padres'},
ar:{left:'الوقت المتبقي اليوم',done:'انتهى الوقت المسموح اليوم',body:'تم الوصول إلى الحد الذي حدده ولي أمرك. عد غدًا أو اطلب من ولي أمرك تعديل الحد.',parents:'مساحة الآباء'},
zh:{left:'今日剩余时间',done:'今天的使用时间已结束',body:'已达到家长设置的时间限制。请明天再来，或请家长调整限制。',parents:'家长专区'},
ja:{left:'今日の残り時間',done:'今日の利用時間は終了しました',body:'保護者が設定した時間上限に達しました。明日また来るか、保護者に上限の変更をお願いしてください。',parents:'保護者エリア'}
};
function lang(){const l=(document.documentElement.lang||'fr').split('-')[0];return copy[l]?l:'fr'}
function t(k){return copy[lang()][k]||copy.fr[k]}
function cookie(name){const m=document.cookie.match(new RegExp('(?:^|; )'+name.replace(/[.$?*|{}()[\]\\/+^]/g,'\\$&')+'=([^;]*)'));return m?decodeURIComponent(m[1]):''}
async function request(url,opts={}){const headers={'Accept':'application/json',...(opts.headers||{})};if(opts.body&&!headers['Content-Type'])headers['Content-Type']='application/json';if(opts.method&&opts.method!=='GET'){const csrf=cookie('child_csrf');if(csrf)headers['X-CSRF-Token']=csrf}const r=await fetch(url,{credentials:'same-origin',...opts,headers});const data=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(data.code||'request_failed');e.code=data.code;e.status=r.status;throw e}return data}
let pill,overlay,lastUsage;
function ensureUi(){if(!pill){pill=document.createElement('div');pill.className='usage-pill';pill.hidden=true;document.body.append(pill)}if(!overlay){overlay=document.createElement('div');overlay.className='usage-overlay';overlay.hidden=true;const card=document.createElement('div');card.className='usage-card';const h=document.createElement('h2');h.dataset.role='title';const p=document.createElement('p');p.dataset.role='body';const a=document.createElement('a');a.href='parents.html';a.dataset.role='parents';card.append(h,p,a);overlay.append(card);document.body.append(overlay)}}
function render(usage){ensureUi();lastUsage=usage;if(!usage)return;const min=Math.ceil(Math.max(0,Number(usage.remaining_seconds||0))/60);pill.hidden=false;pill.textContent=`⏱ ${t('left')} : ${min} min`;if(usage.limit_reached){overlay.hidden=false;overlay.querySelector('[data-role="title"]').textContent=t('done');overlay.querySelector('[data-role="body"]').textContent=t('body');overlay.querySelector('[data-role="parents"]').textContent=t('parents')}else overlay.hidden=true}
async function heartbeat(){if(document.hidden)return;try{const d=await request('/api/child/usage/heartbeat',{method:'POST',body:JSON.stringify({seconds:60})});render(d.usage)}catch(e){if(e.status===401){if(pill)pill.hidden=true;return}if(e.code==='daily_limit_reached'&&lastUsage)render({...lastUsage,remaining_seconds:0,limit_reached:true})}}
async function start(){try{const me=await request('/api/child/me');if(!me?.child)return;render(me.child.usage_today);setInterval(heartbeat,60_000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)heartbeat()})}catch{/* no child session */}}
document.addEventListener('DOMContentLoaded',start);
})();
