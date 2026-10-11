/* ARMANI catalogue. These are draft defaults only; the administrator edits
   and saves each vehicle in Supabase through the website's Edit button. */
(() => {
  'use strict';
  const grid = document.getElementById('cars');
  const host = document.getElementById('fleetExperience');
  if (!grid || !host) return;
  const defaultSpecs = {category:'Преміум',quantity:1,minRank:1,horsepower:'Уточнюється',engine:'Уточнюється',drivetrain:'Уточнюється',maxSpeedKmh:0,acceleration:'Уточнюється',seats:'Уточнюється',location:'Буде додано',plates:[]};
  const names=['Übermacht','Benefactor','Pfister','Enus'];
  const cards=[];let currentFilter='';
  const filters=document.getElementById('fleetFilters');
  const make=(tag,cls,value)=>{const e=document.createElement(tag);e.className=cls;if(value!==undefined)e.textContent=value;return e;};
  function placeholder(){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 640 270');svg.setAttribute('aria-hidden','true');
    svg.innerHTML='<ellipse cx="320" cy="229" rx="255" ry="14" fill="#000" opacity=".35"/><path d="M65 180 98 155 181 140 235 94 372 94 446 139 529 155 574 185 566 207 69 207Z" fill="#203d72" stroke="#8396b6" stroke-width="2"/><path d="M203 139 246 107 366 107 416 139Z" fill="#07111f" stroke="#94aac4" stroke-width="2"/><path d="M316 109v85M109 168h413M248 150h21M384 150h21" stroke="#9eb3cf" stroke-opacity=".5" stroke-width="2"/><path d="m82 178 44-5m391-9 33 13" stroke="#d4af37" stroke-width="5"/><circle cx="167" cy="202" r="40" fill="#060b17" stroke="#4d617d" stroke-width="3"/><circle cx="167" cy="202" r="23" fill="#172945" stroke="#b99c56" stroke-width="2"/><circle cx="469" cy="202" r="40" fill="#060b17" stroke="#4d617d" stroke-width="3"/><circle cx="469" cy="202" r="23" fill="#172945" stroke="#b99c56" stroke-width="2"/>';
    return svg;
  }
  function pair(label,value){const item=make('div','');item.append(make('dt','',label),make('dd','',value));return item;}
  grid.replaceChildren();
  names.forEach((name,index)=>{
    const card=make('article','car media-card fleet-catalog-card');
    const art=make('div','car-art');art.append(placeholder());
    const badges=make('div','catalog-badges');badges.append(make('span','catalog-quantity'),make('span','catalog-rank'));
    const body=make('div','car-bottom');
    const category=make('p','catalog-category');const h3=make('h3','',name);const desc=make('small','','Додайте опис та скриншот автомобіля.');
    const chips=make('div','catalog-chips');const specs=make('dl','catalog-specs');
    const plates=make('div','catalog-plates');plates.setAttribute('aria-label','Номерні знаки');
    const speed=make('div','catalog-speed');
    body.append(category,h3,desc,chips,speed,specs,plates);card.append(art,badges,body);grid.append(card);
    cards.push({card,index,specs:{...defaultSpecs}});
  });
  function paintCard(entry,data){
    const s={...defaultSpecs,...data};entry.specs=s;const c=entry.card;
    const speed=Math.max(0,Number(s.maxSpeedKmh)||0);const quantity=Math.max(1,Math.floor(Number(s.quantity)||1));
    c.querySelector('.catalog-quantity').textContent=`×${quantity}`;
    c.querySelector('.catalog-rank').textContent=`З ${Math.max(1,Number(s.minRank)||1)} рангу`;
    c.querySelector('.catalog-category').textContent=s.category;
    const chips=c.querySelector('.catalog-chips');chips.replaceChildren(...[s.horsepower,s.engine,s.drivetrain].map(v=>make('span','',v)));
    const speedBox=c.querySelector('.catalog-speed');const heading=make('div','catalog-speed-heading');
    heading.append(make('span','','MAX SPEED'),make('strong','',speed?`${speed} км/год`:'Уточнюється'));
    const track=make('div','catalog-speed-track');track.setAttribute('aria-hidden','true');const bar=make('span','');bar.style.width=`${Math.min(100,speed/400*100)}%`;track.append(bar);speedBox.replaceChildren(heading,track);
    c.querySelector('.catalog-specs').replaceChildren(pair('0–100',s.acceleration),pair('САЛОН',s.seats),pair('ЛОКАЦІЯ',s.location));
    const plates=c.querySelector('.catalog-plates');const list=Array.isArray(s.plates)?s.plates:[];
    plates.replaceChildren(...(list.length?list.map(p=>make('span','catalog-plate',p)):[make('span','catalog-no-plate','Номери не додані')]));
  }
  function paintFilters(){
    const categories=[...new Set(cards.map(e=>e.specs.category).filter(Boolean))];
    if(!categories.includes(currentFilter))currentFilter='';
    const oldFocus=document.activeElement?.dataset?.category;
    filters.replaceChildren();
    ['',...categories].forEach(category=>{
      const b=make('button','catalog-filter');b.type='button';b.dataset.category=category;b.setAttribute('aria-pressed',String(currentFilter===category));
      const total=cards.filter(e=>!category||e.specs.category===category).reduce((n,e)=>n+Math.max(1,Number(e.specs.quantity)||1),0);
      b.append(make('span','',category||'Усі'),make('strong','',String(total)));
      b.addEventListener('click',()=>{currentFilter=category;paintFilters();});filters.append(b);
      if(oldFocus===category)b.focus();
    });
    cards.forEach(({card,specs})=>{const wrapper=card.closest('.media-admin-wrap')||card;wrapper.hidden=!!currentFilter&&specs.category!==currentFilter;});
  }
  document.addEventListener('armani:fleet-data',e=>{
    const rows=e.detail||[];
    cards.forEach(entry=>{
      const row=rows.find(r=>r.slot===`fleet-${entry.index}`);
      paintCard(entry,row?.vehicle_specs||{});
    });paintFilters();
  });
  document.querySelectorAll('[data-gallery]').forEach(b=>b.addEventListener('click',()=>{host.hidden=b.dataset.gallery!=='fleet';}));
  cards.forEach(e=>paintCard(e,{}));paintFilters();
})();
