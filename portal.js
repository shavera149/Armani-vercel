(() => {
  'use strict';
  const get = (id) => document.getElementById(id);
  const defaults = { invite: 'aCtM95daZW', ip: '' };
  let config = { ...defaults };

  let refreshTimer;
  let request;
  let revision = 0;

  function parseInvite(value) {
    value = value.trim();
    if (!value) return '';
    if (/^[a-zA-Z0-9_-]{2,100}$/.test(value)) return value;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') throw Error();
      const path = url.hostname === 'discord.gg' ? url.pathname.slice(1) :
        ['discord.com', 'www.discord.com'].includes(url.hostname) && url.pathname.startsWith('/invite/') ? url.pathname.slice(8) : '';
      if (/^[a-zA-Z0-9_-]{2,100}$/.test(path)) return path;
    } catch {}
    throw new Error('Вкажіть дійсне посилання discord.gg або discord.com/invite.');
  }
  try { config.invite = parseInvite(config.invite); } catch { config.invite = ''; }

  function openSettings() {
    get('inviteInput').value = config.invite ? `https://discord.gg/${config.invite}` : '';
    get('ipInput').value = config.ip;
    get('settingsError').textContent = '';
    openModal(get('serverSettings'));
  }
  get('configureServer').addEventListener('click', openSettings);
  get('serverForm').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const invite = parseInvite(get('inviteInput').value);
      const ip = get('ipInput').value.trim();
      if (ip && (!/^[a-zA-Z0-9.:[\]-]+$/.test(ip) || ip.length > 253)) throw new Error('Вкажіть IP або домен із портом, без пробілів і https://.');
      config = { invite, ip };
      try { localStorage.setItem('armani-server', JSON.stringify(config)); toast('Налаштування збережено у цьому браузері'); }
      catch { toast('Налаштування діють до перезавантаження сторінки'); }
      closeModal(get('serverSettings'));
      applyConfig();
    } catch (error) { get('settingsError').textContent = error.message; }
  });

  function setStatus(label, note, live = false) {
    get('discordStatus').textContent = label;
    get('discordStatus').classList.toggle('connected', live);
    get('discordNote').textContent = note;
    document.querySelector('.online-dot').style.background = live ? '#83cc9f' : '#71809b';
  }
  function clearCounts() { get('onlineCount').textContent = '—'; get('totalCount').textContent = '—'; }
  function applyConfig() {
    revision++;
    clearTimeout(refreshTimer);
    request?.abort();
    clearCounts();
    get('discordName').textContent = 'Спільний голос. Спільні плани.';
    get('serverAddress').textContent = config.ip || 'Адреса буде пізніше';
    get('discordJoin').hidden = !config.invite;
    if (config.invite) get('discordJoin').href = `https://discord.gg/${encodeURIComponent(config.invite)}`;
    if (!config.invite) { setStatus('Не налаштовано', 'Додайте запрошення Discord, щоб підключити статистику.'); return; }
    refreshDiscord();
  }
  async function refreshDiscord() {
    clearTimeout(refreshTimer);
    if (!config.invite || document.hidden) return;
    request?.abort();
    const controller = new AbortController(); request = controller;
    const currentRevision = revision;
    const timeout = setTimeout(() => controller.abort(), 12000);
    let delay = 60000;
    setStatus('Оновлення…', 'Отримуємо дані Discord…');
    try {
      const response = await fetch(`https://discord.com/api/v10/invites/${encodeURIComponent(config.invite)}?with_counts=true`, { signal: controller.signal, credentials: 'omit' });
      if (response.status === 429) {
        const body = await response.json().catch(() => ({}));
        delay = Math.max(60000, Math.min(Number(body.retry_after) * 1000 || 60000, 3600000));
        throw new Error('Discord обмежив частоту запитів. Спробуємо пізніше.');
      }
      if (!response.ok) throw new Error(response.status === 404 ? 'Запрошення недійсне або прострочене. Оновіть його в налаштуваннях.' : 'Discord тимчасово недоступний. Спробуємо пізніше.');
      const data = await response.json();
      if (currentRevision !== revision) return;
      if (!Number.isFinite(data.approximate_presence_count) || !Number.isFinite(data.approximate_member_count)) throw new Error('Discord не повернув статистику для цього запрошення.');
      get('onlineCount').textContent = data.approximate_presence_count.toLocaleString('uk-UA');
      get('totalCount').textContent = data.approximate_member_count.toLocaleString('uk-UA');
      get('discordName').textContent = data.guild?.name || 'Спільнота Discord';
      setStatus('Підключено', `Оновлено о ${new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })} · наступне оновлення через хвилину`, true);
    } catch (error) {
      if (currentRevision !== revision) return;
      clearCounts();
      setStatus('Немає зв’язку', error.name === 'AbortError' ? 'Час очікування вичерпано. Повторимо запит пізніше.' : error instanceof TypeError ? 'Не вдалося отримати дані. Перевірте мережу або запрошення Discord.' : error.message);
    } finally {
      clearTimeout(timeout);
      if (currentRevision === revision && !document.hidden) refreshTimer = setTimeout(refreshDiscord, delay);
    }
  }
  document.addEventListener('visibilitychange', () => {
    clearTimeout(refreshTimer);
    if (document.hidden) { revision++; request?.abort(); }
    else refreshDiscord();
  });
  applyConfig();

  async function copyIp(event) {
    if (!config.ip) { toast('NG перебуває в бета-тесті. Адресу сервера додамо пізніше.'); return; }
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(config.ip);
      const original = button.innerHTML;
      button.textContent = '✓ Copied!'; button.classList.add('copied'); button.disabled = true;
      toast('Copied! Адресу сервера скопійовано');
      setTimeout(() => { button.innerHTML = original; button.classList.remove('copied'); button.disabled = false; }, 1800);
    } catch {
      toast('Браузер не дозволив копіювання. Адреса доступна у блоці сервера.');
      get('serverAddress').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      const range = document.createRange(); range.selectNodeContents(get('serverAddress'));
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }
  }
  get('copyIp').addEventListener('click', copyIp);
  get('copyIpSecondary').addEventListener('click', copyIp);

  const fleetDescriptions = [
    'Спорткупе для міських поїздок і зустрічей. Концепт оформлення: королівський синій кузов, стриманий тюнінг і чистий силует. Доступ та модель визначає керівництво.',
    'Позашляховик для спільних виїздів. Концепт оформлення: темний кузов і мінімалістичні акценти. Порядок бронювання та повернення авто необхідно погодити.',
    'Спорткар для особливих подій. Концепт оформлення: синьо-чорна палітра без зайвого декору. Остаточну модель і правила користування буде додано.'
  ];
  const outfits = [
    { name: 'Royal Formal', type: 'Офіційні зустрічі', color: '#1c3672', desc: 'Концепт дрескоду для зустрічей: темно-синій костюм, світла сорочка, стримані золоті аксесуари та темне взуття. Конкретні предмети одягу погоджує керівництво.' },
    { name: 'Midnight Casual', type: 'Щоденний стиль', color: '#182236', desc: 'Концепт повсякденного образу: темна куртка, однотонний верх, прямі штани та мінімум логотипів. Синій акцент об’єднує образ із палітрою сім’ї.' },
    { name: 'Family Operations', type: 'Спільні виїзди', color: '#263c56', desc: 'Концепт образу для організованих подій: практичний темний комплект із синіми деталями. Спорядження та одяг обираються відповідно до правил сервера й плану події.' }
  ];
  const suit = (color) => `<svg viewBox="0 0 180 210" fill="none" aria-hidden="true"><ellipse cx="90" cy="197" rx="65" ry="7" fill="#03050c"/><path d="m56 28 22-10h24l22 10 25 24 13 105-26 4-14-72v99H58V89l-14 72-26-4L31 52Z" fill="${color}" stroke="#8294b866"/><path d="m78 18 12 57 12-57" fill="#e4e7ed"/><path d="m78 20-15 13 9 20-6 7 24 39 24-39-6-7 9-20-15-13-12 55Z" fill="#091225" stroke="#c7ac6855"/><path d="m90 74 3 105M64 114h17m20 0h17" stroke="#c6af7455"/><circle cx="95" cy="118" r="2" fill="#D4AF37"/><circle cx="95" cy="139" r="2" fill="#D4AF37"/><path d="M60 188h60" stroke="#090d19" stroke-width="5"/></svg>`;
  function showMedia(title, description, markup) {
    get('galleryPreview').innerHTML = markup;
    get('galleryModalTitle').textContent = title;
    get('mediaDescription').textContent = description;
    openModal(get('galleryModal'));
  }
  get('cars').querySelectorAll('.car').forEach((card, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'car media-card'; button.innerHTML = card.innerHTML;
    const name = card.querySelector('h3').textContent;
    button.setAttribute('aria-label', `Переглянути ${name}`);
    button.querySelector('.pill').textContent = 'Переглянути ↗';
    button.addEventListener('click', () => showMedia(name, fleetDescriptions[index], button.querySelector('svg').outerHTML));
    card.replaceWith(button);
  });
  outfits.forEach((outfit, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'car media-card';
    button.innerHTML = `<div class="car-art outfit-art"><span class="car-label">DRESSCODE / 0${index + 1}</span>${suit(outfit.color)}</div><div class="car-bottom"><div><h3>${outfit.name}</h3><small>${outfit.type}</small></div><span class="pill">Переглянути ↗</span></div>`;
    button.addEventListener('click', () => showMedia(outfit.name, outfit.desc, suit(outfit.color)));
    get('outfits').append(button);
  });
  document.querySelectorAll('[data-gallery]').forEach((button) => button.addEventListener('click', () => {
    const isFleet = button.dataset.gallery === 'fleet';
    get('cars').hidden = !isFleet; get('outfits').hidden = isFleet;
    document.dispatchEvent(new CustomEvent('armani:gallery-change', { detail: { panel: get(isFleet ? 'cars' : 'outfits') } }));
    document.querySelectorAll('[data-gallery]').forEach((tab) => { const active = tab === button; tab.classList.toggle('active', active); tab.setAttribute('aria-pressed', String(active)); });
  }));
})();
