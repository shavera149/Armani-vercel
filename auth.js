// Public project configuration. Discord Client Secret stays in Supabase.
const SUPABASE_URL = 'https://adczgnhrhzrjhxoahshh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_uS4unWykfpP3mU7yot1J7w_yGrthnpQ';
const login = document.getElementById('discordLogin');
const logout = document.getElementById('discordLogout');
const nameLabel = document.getElementById('accountName');
const status = document.getElementById('authStatus');
const accessModal = document.getElementById('applicationAccess');
const accessLogin = document.getElementById('accessDiscordLogin');
const accessLabel = document.getElementById('accessButtonLabel');
const accessMessage = document.getElementById('accessMessage');
const profileModal = document.getElementById('profileModal');
const profileOpen = document.getElementById('profileOpen');
const profileForm = document.getElementById('characterForm');
const nicknameInput = document.getElementById('characterNickname');
const staticInput = document.getElementById('characterStatic');
const profileSave = document.getElementById('profileSave');
const profileFeedback = document.getElementById('profileFeedback');
let currentUser = null;
let savingProfile = false;
let portalClient = null;

function characterData(user) {
  const metadata = user?.user_metadata || {};
  return {
    nickname: typeof metadata.armani_nickname === 'string' ? metadata.armani_nickname : '',
    staticId: typeof metadata.armani_static_id === 'string' ? metadata.armani_static_id : ''
  };
}
function profileComplete(user) {
  const profile = characterData(user);
  return profile.nickname.trim().length >= 2 && /^[0-9]{1,12}$/.test(profile.staticId);
}
function showProfile() {
  if (!currentUser || savingProfile) return;
  const profile = characterData(currentUser);
  nicknameInput.value = profile.nickname;
  staticInput.value = profile.staticId;
  profileFeedback.hidden = true;
  openModal(profileModal);
}
profileOpen.addEventListener('click', showProfile);
login.addEventListener('click', () => openModal(accessModal));

function message(text) {
  status.textContent = text;
  status.hidden = !text;
  accessMessage.textContent = text;
  accessMessage.hidden = !text;
}
function renderUser(user) {
  currentUser = user;
  if (portalClient) setTimeout(() => document.dispatchEvent(new CustomEvent('armani:session', { detail: { client: portalClient, user: currentUser } })), 0);
  profileOpen.hidden = !user;
  const discord = user?.identities?.find(identity => identity.provider === 'discord');
  const metadata = discord?.identity_data || {};
  nameLabel.textContent = metadata.full_name || metadata.global_name || metadata.name || metadata.user_name || 'Учасник Armani';
  const character = characterData(user);
  if (profileComplete(user)) nameLabel.textContent = `${character.nickname} · #${character.staticId}`;
  nameLabel.title = user ? nameLabel.textContent : '';
  nameLabel.hidden = !user;
  if (!user && profileModal.open) closeModal(profileModal);
  login.hidden = !!user;
  logout.hidden = !user;
  login.disabled = false;
  login.textContent = 'Доступ до заявок';
  accessLogin.disabled = false;
  accessLabel.textContent = 'Увійди через Discord';
  if (user && accessModal.open) closeModal(accessModal);
}
function cleanCallback() {
  const url = new URL(location.href);
  for (const key of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}

async function initialize() {
  try {
    // Versioned browser ESM entry; no build step or secret credentials required.
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true }
    });
    portalClient = client;
    client.auth.onAuthStateChange((_event, session) => renderUser(session?.user || null));

    accessLogin.addEventListener('click', async () => {
      accessLogin.disabled = true;
      accessLabel.textContent = 'Переходимо до Discord…';
      message('');
      try {
        const { error } = await client.auth.signInWithOAuth({
          provider: 'discord',
          options: { redirectTo: new URL('/', location.origin).href }
        });
        if (error) throw error;
      } catch {
        renderUser(null);
        message('Не вдалося розпочати вхід. Перевірте мережу та налаштування Discord у Supabase.');
      }
    });
    profileForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!currentUser || savingProfile) return;
      const nickname = nicknameInput.value.trim().replace(/\s+/g, ' ');
      const staticId = staticInput.value.trim();
      profileFeedback.hidden = false;
      profileFeedback.dataset.error = 'true';
      if (nickname.length < 2 || nickname.length > 40 || !/^[\p{L}\p{N} _.'’\-]+$/u.test(nickname)) {
        profileFeedback.textContent = 'Нікнейм: 2–40 символів, літери, цифри, пробіл, крапка, апостроф, дефіс або підкреслення.';
        return;
      }
      if (!/^[0-9]{1,12}$/.test(staticId)) {
        profileFeedback.textContent = 'Static ID має містити від 1 до 12 цифр.';
        return;
      }
      savingProfile = true;
      profileSave.disabled = true;
      logout.disabled = true;
      profileSave.textContent = 'Збереження…';
      profileFeedback.hidden = true;
      const userId = currentUser.id;
      try {
        // User-editable display fields only; never use these for permissions.
        const { data, error } = await client.auth.updateUser({
          data: { armani_nickname: nickname, armani_static_id: staticId }
        });
        if (error || !data.user) throw error || new Error('No user returned');
        if (currentUser?.id !== userId) return;
        renderUser(data.user);
        profileFeedback.dataset.error = 'false';
        profileFeedback.textContent = 'Профіль збережено. Нікнейм і Static ID оновлено в шапці сайту.';
        profileFeedback.hidden = false;
      } catch {
        profileFeedback.dataset.error = 'true';
        profileFeedback.textContent = 'Не вдалося зберегти профіль. Перевірте мережу та спробуйте знову. Ваші введені дані залишилися у формі.';
        profileFeedback.hidden = false;
      } finally {
        savingProfile = false;
        profileSave.disabled = false;
        logout.disabled = false;
        profileSave.textContent = 'Зберегти профіль';
      }
    });
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      try {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw error;
        renderUser(null);
        message('Ви вийшли з акаунта на цьому пристрої.');
      } catch { message('Не вдалося вийти. Перевірте мережу й повторіть спробу.'); }
      finally { logout.disabled = false; }
    });

    const params = new URL(location.href).searchParams;
    if (params.has('error')) {
      cleanCallback();
      message('Вхід через Discord скасовано або не завершено. Спробуйте ще раз.');
    } else if (params.has('code')) {
      const code = params.get('code');
      cleanCallback();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) message('Не вдалося завершити вхід. Почніть його знову в цій самій вкладці.');
      else message('Ви увійшли через Discord. Ласкаво просимо до Armani!');
    }
    // Fetch verified user identity rather than trusting browser storage for display.
    const { data, error } = await client.auth.getUser();
    renderUser(error ? null : data.user);
    if (!error && data.user && !profileComplete(data.user)) showProfile();
    // Login alone grants no editing privileges. Future writes require database RLS.
  } catch {
    login.disabled = false;
    accessLogin.disabled = true;
    accessLabel.textContent = 'Вхід тимчасово недоступний';
    message('Не вдалося підключити авторизацію. Перевірте мережу та перезавантажте сторінку.');
  }
}
initialize();
