/* ARMANI fleet — edit this block to change names, screenshots and performance.
   Empty image: use the screenshot saved by the site admin, or a vector placeholder.
   Supabase-admin names/descriptions are used when available. Set preferAdminContent
   to false if this file should control all vehicle text and images instead.
   Speeds below are UI examples, not verified NG server vehicle statistics. */
const ARMANI_FLEET = {
  preferAdminContent: true,
  gaugeMaxKmh: 350,
  vehicles: [
    { id: 'ubermacht', name: 'Übermacht', category: 'SPORT COUPÉ',
      description: 'Спортивне купе для міських маршрутів і впевнених виїздів сім’ї.',
      image: '', maxSpeedKmh: 285, drivetrain: 'Задній', seats: 2, className: 'Спорткупе', color: '#2454a4' },
    { id: 'benefactor', name: 'Benefactor', category: 'EXECUTIVE SUV',
      description: 'Просторий позашляховик для спільних поїздок. Комфорт, стриманість і впізнаваний силует.',
      image: '', maxSpeedKmh: 240, drivetrain: 'Повний', seats: 4, className: 'Позашляховик', color: '#304768' },
    { id: 'pfister', name: 'Pfister', category: 'GRAND TOURING',
      description: 'Спорткар для особливих маршрутів. Низький профіль і характер у кожній деталі.',
      image: '', maxSpeedKmh: 310, drivetrain: 'Повний', seats: 2, className: 'Спорткар', color: '#20365f' },
    { id: 'enus', name: 'Enus', category: 'PRIVATE CLASS',
      description: 'Представницький седан для офіційних зустрічей та спокійних поїздок вищого складу.',
      image: '', maxSpeedKmh: 260, drivetrain: 'Задній', seats: 4, className: 'Седан', color: '#182844' }
  ]
};

(() => {
  'use strict';
  const grid = document.getElementById('cars');
  const host = document.getElementById('fleetExperience');
  if (!grid || !host) return;
  const panel = document.getElementById('fleetDetail');
  const stage = document.getElementById('fleetStage');
  const text = (id, value) => { document.getElementById(id).textContent = value; };
  const el = (tag, className, value) => {
    const node = document.createElement(tag); node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  const gaugeMax = Number.isFinite(ARMANI_FLEET.gaugeMaxKmh) && ARMANI_FLEET.gaugeMaxKmh > 0 ? ARMANI_FLEET.gaugeMaxKmh : 350;
  const speedOf = car => Math.max(0, Number(car.maxSpeedKmh) || 0);
  const percentage = car => Math.min(100, speedOf(car) / gaugeMax * 100);
  // Inline vector is only a placeholder. Replace via image above or admin upload.
  function illustration(car) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 640 270'); svg.setAttribute('aria-hidden', 'true');
    const body = car.id === 'benefactor'
      ? 'M74 171 104 143 163 132 198 72 406 72 458 129 538 149 565 177 561 206 77 206Z'
      : 'M65 180 98 155 181 140 235 94 372 94 446 139 529 155 574 185 566 207 69 207Z';
    const glass = car.id === 'benefactor'
      ? 'M184 130 213 87 398 87 435 130Z'
      : 'M203 139 246 107 366 107 416 139Z';
    const color = /^#[a-f0-9]{6}$/i.test(car.color) ? car.color : '#2454a4';
    svg.innerHTML = `<ellipse cx="321" cy="228" rx="257" ry="16" fill="#000" opacity=".35"/><path d="${body}" fill="${color}" stroke="#8da2c1" stroke-width="2"/><path d="${glass}" fill="#07111f" stroke="#94aac4" stroke-width="2"/><path d="M316 109v85M109 168h413M248 150h21M384 150h21" stroke="#9eb3cf" stroke-opacity=".6" stroke-width="2"/><path d="m82 178 44-5m391-9 33 13" stroke="#e2ca84" stroke-width="5"/><path d="M87 207h461" stroke="#d4af37" stroke-opacity=".6" stroke-width="2"/><circle cx="167" cy="202" r="40" fill="#060b17" stroke="#4d617d" stroke-width="3"/><circle cx="167" cy="202" r="23" fill="#172945" stroke="#b99c56" stroke-width="2"/><circle cx="469" cy="202" r="40" fill="#060b17" stroke="#4d617d" stroke-width="3"/><circle cx="469" cy="202" r="23" fill="#172945" stroke="#b99c56" stroke-width="2"/><circle cx="167" cy="202" r="7" fill="#c9ac66"/><circle cx="469" cy="202" r="7" fill="#c9ac66"/>`;
    return svg;
  }
  function safeImage(source) {
    if (!source) return '';
    try { const url = new URL(source, location.href); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  }
  const buttons = [];
  grid.replaceChildren();
  grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Оберіть автомобіль');
  ARMANI_FLEET.vehicles.forEach((car, index) => {
    const card = el('button', 'car media-card fleet-choice'); card.type = 'button';
    card.setAttribute('aria-controls', 'fleetDetail'); card.setAttribute('aria-pressed', 'false');
    const top = el('div', 'fleet-choice-top');
    top.append(el('span', '', `0${index + 1} / ${car.category}`), el('span', 'fleet-choice-arrow', '↗'));
    const art = el('div', 'car-art'); art.append(illustration(car));
    const bottom = el('div', 'car-bottom'); const title = el('div', 'fleet-choice-title');
    title.append(el('h3', '', car.name), el('small', '', car.description)); bottom.append(title);
    const speed = el('div', 'fleet-mini-speed');
    speed.append(el('span', '', 'MAX SPEED'), el('strong', '', `${speedOf(car)} km/h`));
    const track = el('div', 'fleet-track'); track.setAttribute('aria-hidden', 'true');
    const fill = el('span', ''); fill.style.width = `${percentage(car)}%`; track.append(fill);
    card.append(top, art, bottom, speed, track); grid.append(card); buttons.push(card);
    card.addEventListener('click', () => select(index, true));
  });
  let activeIndex = 0;
  let signature = '';
  let animations = [];
  function select(index, animate = false) {
    const car = ARMANI_FLEET.vehicles[index]; if (!car) return;
    activeIndex = index;
    buttons.forEach((card, i) => {
      card.classList.toggle('is-selected', i === index);
      card.setAttribute('aria-pressed', String(i === index));
    });
    const card = buttons[index];
    const name = ARMANI_FLEET.preferAdminContent ? card.querySelector('h3').textContent : car.name;
    const description = ARMANI_FLEET.preferAdminContent ? card.dataset.description || card.querySelector('small').textContent : car.description;
    const uploaded = ARMANI_FLEET.preferAdminContent ? card.querySelector('.car-art img')?.getAttribute('src') : '';
    const source = safeImage(car.image || uploaded);
    const nextSignature = JSON.stringify([index, name, description, source, car.maxSpeedKmh]);
    if (nextSignature === signature) return; signature = nextSignature;
    text('fleetName', name); text('fleetDescription', description);
    text('fleetNumber', `0${index + 1} / 04`); text('fleetCategory', car.category);
    text('fleetClass', car.className); text('fleetDrive', car.drivetrain); text('fleetSeats', String(car.seats));
    text('fleetSpeed', String(speedOf(car))); text('fleetGaugeEnd', `${gaugeMax} km/h`);
    text('fleetImageNote', source ? 'ARMANI / FAMILY COLLECTION' : 'КОНЦЕПТ · ДОДАЙТЕ СКРИНШОТ');
    const gauge = document.getElementById('fleetGauge');
    gauge.setAttribute('aria-valuemax', String(Math.max(gaugeMax, speedOf(car))));
    gauge.setAttribute('aria-valuenow', String(speedOf(car)));
    gauge.setAttribute('aria-valuetext', `${speedOf(car)} кілометрів за годину`);
    document.getElementById('fleetGaugeFill').style.width = `${percentage(car)}%`;
    stage.replaceChildren();
    if (source) {
      const img = new Image(); img.alt = name; img.decoding = 'async';
      img.addEventListener('error', () => {
        if (stage.contains(img)) { stage.replaceChildren(illustration(car)); text('fleetImageNote', 'ФОТО НЕДОСТУПНЕ · КОНЦЕПТ'); }
      });
      img.src = source; stage.append(img);
    } else stage.append(illustration(car));
    animations.forEach(animation => animation.cancel()); animations = [];
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches && panel.animate) {
      animations.push(panel.animate([{opacity:.45,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:380,easing:'cubic-bezier(.2,.7,.2,1)'}));
    }
  }
  // Existing dashboard.js injects public admin content after Supabase has loaded.
  // Refresh the active panel when an admin updates a name, description or screenshot.
  new MutationObserver(() => select(activeIndex)).observe(grid, {
    subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['src','data-description']
  });
  document.querySelectorAll('[data-gallery]').forEach(tab => tab.addEventListener('click', () => {
    host.hidden = tab.dataset.gallery !== 'fleet';
  }));
  select(0);
})();
