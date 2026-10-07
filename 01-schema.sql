-- Run in the Supabase SQL Editor as project owner. Safe to run again.
begin;
create schema if not exists armani_private;
revoke all on schema armani_private from public, anon, authenticated;
create table if not exists armani_private.admin_discord_ids (
  discord_id text primary key check (discord_id ~ '^[0-9]{17,20}$')
);
alter table armani_private.admin_discord_ids enable row level security;
revoke all on armani_private.admin_discord_ids from public, anon, authenticated;

-- provider_id comes from the OAuth identity, NOT user-editable user_metadata.
create or replace function public.armani_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.identities i
    join armani_private.admin_discord_ids a on a.discord_id = i.provider_id
    where i.user_id = auth.uid() and i.provider = 'discord'
  );
$$;
revoke all on function public.armani_is_admin() from public, anon;
grant execute on function public.armani_is_admin() to authenticated;

create table if not exists public.armani_leadership (
  slot integer primary key check(slot between 1 and 3),
  nickname text not null check(char_length(btrim(nickname)) between 2 and 40),
  role text not null check(role in ('LEADER','DEPUTY','CURATOR')),
  description text not null default '' check(char_length(description)<=100)
);
insert into public.armani_leadership values
(1,'Alessandro Armani','LEADER','Лідер сім’ї · приклад'),
(2,'Marco Armani','DEPUTY','Заступник лідера · приклад'),
(3,'Vittorio Armani','CURATOR','Куратор складу · приклад') on conflict do nothing;

create table if not exists public.armani_media (
  slot text primary key check(slot in ('fleet-0','fleet-1','fleet-2','dress-0','dress-1','dress-2','estate')),
  image_path text check(image_path is null or image_path ~ '^media/[a-f0-9-]+\.(png|jpg|webp)$'),
  title text not null check(char_length(btrim(title)) between 1 and 80),
  description text not null default '' check(char_length(description)<=1000)
);
insert into public.armani_media(slot,title,description) values
('fleet-0','Übermacht','Спорткупе · приклад'),('fleet-1','Benefactor','Позашляховик · приклад'),
('fleet-2','Pfister','Спорткар · приклад'),('dress-0','Royal Formal','Офіційні зустрічі · концепт'),
('dress-1','Midnight Casual','Щоденний стиль · концепт'),('dress-2','Family Operations','Спільні виїзди · концепт'),
('estate','Маєток сім’ї','Територія Armani') on conflict do nothing;

create table if not exists public.armani_stats (
  id integer primary key check(id=1),
  family_rank integer not null default 8 check(family_rank between 1 and 9999),
  points bigint not null default 18450 check(points between 0 and 999999999),
  members integer not null default 24 check(members between 0 and 100000),
  vehicles integer not null default 12 check(vehicles between 0 and 100000),
  bot_version bigint not null default 0,
  updated_at timestamptz not null default now(),
  source text not null default 'demo' check(source in ('demo','manual','discord'))
);
insert into public.armani_stats(id) values(1) on conflict do nothing;
create table if not exists public.armani_leaderboard (
  discord_id text primary key check(discord_id ~ '^[0-9]{17,20}$'),
  nickname text not null check(char_length(btrim(nickname)) between 2 and 40),
  xp bigint not null check(xp between 0 and 999999999)
);

alter table public.armani_leadership enable row level security;
alter table public.armani_media enable row level security;
alter table public.armani_stats enable row level security;
alter table public.armani_leaderboard enable row level security;
revoke all on public.armani_leadership, public.armani_media, public.armani_stats, public.armani_leaderboard from public, anon, authenticated;
grant select on public.armani_leadership, public.armani_media, public.armani_stats, public.armani_leaderboard to anon, authenticated;
grant update on public.armani_leadership, public.armani_media to authenticated;
grant all on public.armani_leadership, public.armani_media, public.armani_stats, public.armani_leaderboard to service_role;

drop policy if exists armani_leadership_read on public.armani_leadership;
create policy armani_leadership_read on public.armani_leadership for select to anon,authenticated using(true);
drop policy if exists armani_leadership_edit on public.armani_leadership;
create policy armani_leadership_edit on public.armani_leadership for update to authenticated using((select public.armani_is_admin())) with check((select public.armani_is_admin()));
drop policy if exists armani_media_read on public.armani_media;
create policy armani_media_read on public.armani_media for select to anon,authenticated using(true);
drop policy if exists armani_media_edit on public.armani_media;
create policy armani_media_edit on public.armani_media for update to authenticated using((select public.armani_is_admin())) with check((select public.armani_is_admin()));
drop policy if exists armani_stats_read on public.armani_stats;
create policy armani_stats_read on public.armani_stats for select to anon,authenticated using(true);
drop policy if exists armani_ranking_read on public.armani_leaderboard;
create policy armani_ranking_read on public.armani_leaderboard for select to anon,authenticated using(true);

create or replace function public.armani_edit_stats(p_rank integer,p_points bigint,p_members integer,p_vehicles integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.armani_is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 update public.armani_stats set family_rank=p_rank,points=p_points,members=p_members,vehicles=p_vehicles,source='manual',updated_at=now() where id=1;
end; $$;
revoke all on function public.armani_edit_stats(integer,bigint,integer,integer) from public,anon;
grant execute on function public.armani_edit_stats(integer,bigint,integer,integer) to authenticated;

-- Atomic, versioned snapshots. Only the server's service-role key may call this.
create or replace function public.armani_sync_ranking(p_version bigint,p_entries jsonb,p_rank integer,p_points bigint,p_members integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare old_version bigint;
begin
 if jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)>100 then raise exception 'Invalid entries'; end if;
 select bot_version into old_version from public.armani_stats where id=1 for update;
 if p_version<=old_version then return false; end if;
 delete from public.armani_leaderboard;
 insert into public.armani_leaderboard(discord_id,nickname,xp)
 select x.discord_id,x.nickname,x.xp from jsonb_to_recordset(p_entries) as x(discord_id text,nickname text,xp bigint);
 update public.armani_stats set bot_version=p_version,family_rank=p_rank,points=p_points,members=p_members,source='discord',updated_at=now() where id=1;
 return true;
end; $$;
revoke all on function public.armani_sync_ranking(bigint,jsonb,integer,bigint,integer) from public,anon,authenticated;
grant execute on function public.armani_sync_ranking(bigint,jsonb,integer,bigint,integer) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('armani-media','armani-media',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists armani_upload on storage.objects;
create policy armani_upload on storage.objects for insert to authenticated with check(bucket_id='armani-media' and (storage.foldername(name))[1]='media' and (select public.armani_is_admin()));
drop policy if exists armani_remove on storage.objects;
create policy armani_remove on storage.objects for delete to authenticated using(bucket_id='armani-media' and (select public.armani_is_admin()));
drop policy if exists armani_files_read on storage.objects;
create policy armani_files_read on storage.objects for select to authenticated using(bucket_id='armani-media' and (select public.armani_is_admin()));
commit;
