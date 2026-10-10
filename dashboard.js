// Shared public content; all writes are independently authorized by Supabase RLS.
const $ = id => document.getElementById(id);
const ROOT = 'https://adczgnhrhzrjhxoahshh.supabase.co';
let db, currentId = null, admin = false, permissionRevision = 0;
let initialized = false, refreshInProgress = false, editor = null, busy = false;
let leaders = [], media = [], stats = null, rankingSignature = null;
const controls = [];
const validPath = p => /^media\/[a-f0-9-]+\.(png|jpg|webp)$/.test(p || '');
const imageUrl = p => `${ROOT}/storage/v1/object/public/armani-media/${p}`;
const fmt = n => Number(n).toLocaleString('uk-UA');
function setAdmin(value) {
  admin = value; $('adminBadge').hidden = !admin; $('editBtn').hidden = !admin; $('uploadBtn').hidden = !admin;
  controls.forEach(b => b.hidden = !admin);
  if (!admin) { if ($('contentEditor').open) closeModal($('contentEditor')); if ($('editModal').open) closeModal($('editModal')); }
}
function createControls() {
  document.querySelectorAll('#team .leadership-card').forEach((card,i) => addButton(card,()=>editLeader(i+1)));
  for(const [id,prefix] of [['cars','fleet'],['outfits','dress']]) {
    document.querySelectorAll(`#${id} .media-card`).forEach((card,i)=>{
      const wrapper=document.createElement('div'); wrapper.className='media-admin-wrap';
      card.before(wrapper);wrapper.append(card);addButton(wrapper,()=>editMedia(`${prefix}-${i}`));
    });
  }
  $('uploadBtn').onclick=()=>editMedia('estate');
  $('editBtn').onclick=()=>{
    if(!admin || !stats)return;
    $('rankInput').value=stats.family_rank;$('pointsInput').value=stats.points;
    $('membersInput').value=stats.members;$('vehiclesInput').value=stats.vehicles;
    $('statsFeedback').textContent='';openModal($('editModal'));
  };
}
function addButton(parent,handler){
  const b=document.createElement('button');b.type='button';b.className='btn admin-edit';b.textContent='✎ Редагувати';b.hidden=true;
  b.addEventListener('click',handler);parent.append(b);controls.push(b);
}
function editLeader(slot){
  const row=leaders.find(r=>r.slot===slot);if(!admin||!row||busy)return;
  editor={kind:'leader',id:slot};$('contentEditorTitle').textContent='Редагувати вищий склад';
  $('contentTitle').value=row.nickname;$('contentTitle').maxLength=40;$('contentDescription').value=row.description;
  $('contentDescription').maxLength=100;$('contentRole').value=row.role;
  $('roleField').hidden=false;$('photoField').hidden=false;startEditor();
  const preview=$('leaderPhotoPreview');preview.hidden=!validPath(row.image_path);
  if(!preview.hidden)preview.src=imageUrl(row.image_path);
}
function editMedia(slot){
  const row=media.find(r=>r.slot===slot);if(!admin||!row||busy)return;
  editor={kind:'media',id:slot};$('contentEditorTitle').textContent='Фото та опис';
  $('contentTitle').value=row.title;$('contentTitle').maxLength=80;$('contentDescription').value=row.description;
  $('contentDescription').maxLength=1000;$('roleField').hidden=true;$('photoField').hidden=false;startEditor();
}
function startEditor(){$('leaderPhotoPreview').hidden=true;$('leaderPhotoPreview').removeAttribute('src');$('contentPhoto').value='';$('contentFeedback').textContent='';openModal($('contentEditor'));}
function paint() {
  const cards=[...document.querySelectorAll('#team .leadership-card')];
  leaders.forEach(row=>{
    const card=cards[row.slot-1];if(!card)return;
    card.querySelector('strong').textContent=row.nickname;card.querySelector('small').textContent=row.description;
    card.querySelector('.rank').textContent=row.role;card.querySelector('.avatar>span').textContent=Array.from(row.nickname)[0]||'A';
    const avatar=card.querySelector('.avatar');let photo=avatar.querySelector('img');
    if(validPath(row.image_path)){
      if(!photo){photo=document.createElement('img');avatar.append(photo);}
      photo.src=imageUrl(row.image_path);photo.alt=`Персонаж ${row.nickname}`;photo.loading='lazy';
      avatar.classList.add('has-photo');
    }else{photo?.remove();avatar.classList.remove('has-photo');}
  });
  media.forEach(row=>{
    if(row.slot==='estate'){
      if(validPath(row.image_path)){
        let img=$('estatePhoto').querySelector('img');if(!img){img=document.createElement('img');$('estatePhoto').prepend(img);}
        img.src=imageUrl(row.image_path);img.alt=row.title;
      }
      document.querySelector('.estate-info h3').textContent=row.title;
      document.querySelector('.estate-info>p').textContent=row.description;return;
    }
    const [kind,index]=row.slot.split('-');const card=document.querySelectorAll(kind==='fleet'?'#cars .media-card':'#outfits .media-card')[Number(index)];
    if(!card)return;card.querySelector('h3').textContent=row.title;card.querySelector('small').textContent=row.description;
    card.dataset.description=row.description;card.setAttribute('aria-label',`Переглянути ${row.title}`);
    if(validPath(row.image_path)){
      const art=card.querySelector('.car-art');let img=art.querySelector('img');
      if(!img){img=document.createElement('img');art.replaceChildren(img);}
      img.src=imageUrl(row.image_path);img.alt=row.title;img.loading='lazy';
    }
  });
  if(stats){
    $('familyRank').textContent='#'+String(stats.family_rank).padStart(2,'0');$('familyPoints').textContent=fmt(stats.points);
    const counters=document.querySelectorAll('.stats .stat strong');counters[0].textContent=fmt(stats.members);counters[1].textContent=fmt(stats.vehicles);
    const label=stats.source==='discord'?'Discord-бот':stats.source==='manual'?'Адміністратор':'Демонстраційні дані';
    $('syncNote').textContent=`${label} · ${new Date(stats.updated_at).toLocaleString('uk-UA')} · перевірка оновлень кожні 30 с`;
    document.querySelector('.update-mode').textContent=label;
  }
}
function paintRanking(rows){
  const signature=JSON.stringify(rows);if(signature===rankingSignature)return;rankingSignature=signature;
  const list=document.querySelector('.leaderboard-list');list.replaceChildren();
  if(!rows.length){const empty=document.createElement('li');empty.className='toprow';empty.textContent='Бот ще не передав рейтинг.';list.append(empty);return;}
  const max=rows[0].xp||1;
  rows.slice(0,10).forEach((r,i)=>{
    const li=document.createElement('li');li.className='toprow '+(['first','second','third'][i] || '');
    const position=document.createElement('span');position.className='position';position.textContent=String(i+1).padStart(2,'0');
    const player=document.createElement('div');player.className='player';const name=document.createElement('strong');name.textContent=r.nickname;
    const track=document.createElement('span');track.className='xp-track';track.setAttribute('aria-hidden','true');const bar=document.createElement('i');bar.style.width=`${Math.min(100,r.xp/max*100)}%`;track.append(bar);player.append(name,track);
    const xp=document.createElement('div');xp.className='xp-value';xp.textContent=fmt(r.xp)+' RP';li.append(position,player,xp);list.append(li);
  });
  document.dispatchEvent(new Event('armani:ranking-change'));
}
async function refresh(){
  if(!db||refreshInProgress)return;refreshInProgress=true;
  try{
    const results=await Promise.all([
      db.from('armani_leadership').select('*').order('slot'),db.from('armani_media').select('*'),
      db.from('armani_stats').select('*').eq('id',1).single(),db.from('armani_rp_leaderboard').select('nickname,xp:rp_balance').order('position').limit(10),
      db.from('armani_rp_sync_status').select('updated_at').eq('id',1).single()
    ]);
    if(results.some(r=>r.error))throw Error('content_unavailable');
    leaders=results[0].data;media=results[1].data;stats=results[2].data;paint();paintRanking(results[3].data);
    document.querySelector('.premium-foot>span:last-child').textContent='TOP 10';
    document.querySelector('.leaderboard-head>span:last-child').textContent='БАЛАНС RP';
    const synced=results[4].data.updated_at;
    document.querySelector('.update-mode').textContent='Discord · RP';
    $('syncNote').textContent=synced ? `RP із Discord · синхронізовано ${new Date(synced).toLocaleString('uk-UA')} · перевірка кожні 30 с` : 'Бот ще не передав RP-рейтинг.';
  }catch{$('syncNote').textContent='Спільні дані недоступні. Показано останні завантажені дані або ескіз. Власнику: перевірте встановлення SQL.';}
  finally{refreshInProgress=false;}
}
async function validateImage(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5242880)throw Error('Оберіть JPG, PNG або WebP до 5 МБ.');
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
  const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!(file.type==='image/png'&&png||file.type==='image/jpeg'&&jpg||file.type==='image/webp'&&webp))throw Error('Файл не відповідає формату зображення.');
}
$('contentForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!admin||!editor||busy)return;
  busy=true;$('contentSave').disabled=true;$('contentFeedback').textContent='Збереження…';
  let newPath=null;const selection={...editor};
  try{
    const title=$('contentTitle').value.trim(),description=$('contentDescription').value.trim();
    if(!title)throw Error('Вкажіть назву або нікнейм.');
    if(selection.kind==='leader'){
      if(title.length<2||title.length>40)throw Error('Нікнейм має містити від 2 до 40 символів.');
      const update={nickname:title,description,role:$('contentRole').value};
      const file=$('contentPhoto').files[0];
      if(file){
        await validateImage(file);
        const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type];
        newPath=`media/${crypto.randomUUID()}.${ext}`;
        const {error}=await db.storage.from('armani-media').upload(newPath,file,{contentType:file.type,upsert:false});
        if(error)throw Error('Не вдалося завантажити фото. Перевірте права адміністратора та Storage.');
        update.image_path=newPath;
      }
      const {data,error}=await db.from('armani_leadership').update(update).eq('slot',selection.id).select('slot');
      if(error||!data?.length){
        if(newPath){try{await db.storage.from('armani-media').remove([newPath]);}catch{}}
        throw Error('Не вдалося зберегти. Перевірте права адміністратора й виконання SQL-оновлення для чотирьох карток.');
      }
    }else{
      const file=$('contentPhoto').files[0];const update={title,description};
      if(file){
        await validateImage(file);const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type];
        newPath=`media/${crypto.randomUUID()}.${ext}`;
        const {error}=await db.storage.from('armani-media').upload(newPath,file,{contentType:file.type,upsert:false});
        if(error)throw Error('Завантаження фото не вдалося. Перевірте права та Storage.');
        update.image_path=newPath;
      }
      const {data,error}=await db.from('armani_media').update(update).eq('slot',selection.id).select('slot');
      if(error||!data?.length){if(newPath)await db.storage.from('armani-media').remove([newPath]);throw Error('Не вдалося зберегти картку. Спробуйте ще раз.');}
      // Old images are kept, so parallel edits never delete another saved image.
    }
    $('contentFeedback').textContent='Збережено для всіх відвідувачів.';await refresh();
  }catch(error){$('contentFeedback').textContent=error.message||'Помилка збереження. Спробуйте ще раз.';}
  finally{busy=false;$('contentSave').disabled=false;}
});
$('statsForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!admin)return;const submit=e.currentTarget.querySelector('[type=submit]');submit.disabled=true;
  try{
    const {error}=await db.rpc('armani_edit_stats',{p_rank:Number($('rankInput').value),p_points:Number($('pointsInput').value),p_members:Number($('membersInput').value),p_vehicles:Number($('vehiclesInput').value)});
    if(error)throw error;$('statsFeedback').textContent='Збережено для всіх.';await refresh();
  }catch{$('statsFeedback').textContent='Не вдалося зберегти. Перевірте права адміністратора.';}
  finally{submit.disabled=false;}
});
document.addEventListener('armani:session',async e=>{
  db=e.detail.client;const user=e.detail.user;const nextId=user?.id||null;
  const version=++permissionRevision;currentId=nextId;setAdmin(false);
  if(!initialized){initialized=true;createControls();await refresh();}
  if(version!==permissionRevision||!currentId)return;
  const {data,error}=await db.rpc('armani_is_admin');
  if(version===permissionRevision)setAdmin(!error&&data===true);
});
setInterval(()=>{if(!document.hidden)refresh();},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
