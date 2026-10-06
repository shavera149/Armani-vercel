// Public project configuration. Discord Client Secret stays in Supabase.
const SUPABASE_URL = 'https://adczgnhrhzrjhxoahshh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_uS4unWykfpP3mU7yot1J7w_yGrthnpQ';
const login = document.getElementById('discordLogin');
const logout = document.getElementById('discordLogout');
const nameLabel = document.getElementById('accountName');
const status = document.getElementById('authStatus');

function message(text) {
  status.textContent = text;
  status.hidden = !text;
}
function renderUser(user) {
  const discord = user?.identities?.find(identity => identity.provider === 'discord');
  const metadata = discord?.identity_data || {};
  nameLabel.textContent = metadata.full_name || metadata.global_name || metadata.name || metadata.user_name || 'Учасник Armani';
  nameLabel.hidden = !user;
  login.hidden = !!user;
  logout.hidden = !user;
  login.disabled = false;
  login.textContent = 'Увійти через Discord ↗';
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
    client.auth.onAuthStateChange((_event, session) => renderUser(session?.user || null));

    login.addEventListener('click', async () => {
      login.disabled = true;
      login.textContent = 'Переходимо до Discord…';
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
    // Login alone grants no editing privileges. Future writes require database RLS.
  } catch {
    login.disabled = true;
    login.textContent = 'Вхід тимчасово недоступний';
    message('Не вдалося підключити авторизацію. Перевірте мережу та перезавантажте сторінку.');
  }
}
initialize();
