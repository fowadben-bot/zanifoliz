(()=>{'use strict';
const box=document.querySelector('#usage-summary');
if(!box)return;
const labels={fr:['Temps utilisé aujourd’hui','Limite','Messages ZaniChat'],en:['Time used today','Limit','ZaniChat messages'],es:['Tiempo usado hoy','Límite','Mensajes ZaniChat'],ar:['الوقت المستخدم اليوم','الحد','رسائل زاني شات'],zh:['今日已用时间','限制','ZaniChat 消息'],ja:['今日の利用時間','上限','ZaniChat メッセージ']};
function lang(){const l=(document.documentElement.lang||'fr').split('-')[0];return labels[l]?l:'fr'}
function cookie(name){const m=document.cookie.match(new RegExp('(?:^|; )'+name.replace(/[.$?*|{}()[\]\\/+^]/g,'\\$&')+'=([^;]*)'));return m?decodeURIComponent(m[1]):''}
async function api(url){const r=await fetch(url,{credentials:'same-origin',headers:{Accept:'application/json'}});if(!r.ok)throw new Error(String(r.status));return r.json()}
function render(children){box.replaceChildren();const t=labels[lang()];for(const child of children||[]){if(child.status!=='active')continue;const u=child.usage_today||{};const used=Math.ceil(Number(u.active_seconds||0)/60);const card=document.createElement('article');card.className='child-manage-card';const h=document.createElement('h3');h.textContent=`${child.nickname} · ${child.hero}`;const p=document.createElement('p');p.className='small';p.textContent=`${t[0]} : ${used} min · ${t[1]} : ${child.daily_minutes} min · ${t[2]} : ${Number(u.chat_messages||0)}`;card.append(h,p);box.append(card)}}
async function load(){try{const d=await api('/api/parent/children');render(d.children)}catch{box.replaceChildren()}}
window.addEventListener('parent-dashboard-ready',load);
setTimeout(load,450);
document.querySelectorAll('.lang-btn').forEach(b=>b.addEventListener('click',()=>setTimeout(load,50)));
})();
