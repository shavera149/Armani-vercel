-- Run after the previously installed 01-schema.sql. Does not alter bot data or family statistics.
begin;
create table if not exists public.armani_rp_leaderboard (
 discord_id text primary key check(discord_id ~ '^[0-9]{17,20}$'),
 nickname text not null check(char_length(btrim(nickname)) between 2 and 40),
 rp_balance bigint not null check(rp_balance between 0 and 999999999),
 contract_rp_earned bigint not null check(contract_rp_earned between 0 and 999999999),
 position integer unique not null check(position between 1 and 10)
);
create table if not exists public.armani_rp_sync_status (
 id integer primary key check(id=1),
 version bigint not null default 0,
 updated_at timestamptz
);
insert into public.armani_rp_sync_status(id) values(1) on conflict do nothing;
alter table public.armani_rp_leaderboard enable row level security;
alter table public.armani_rp_sync_status enable row level security;
revoke all on public.armani_rp_leaderboard, public.armani_rp_sync_status from public,anon,authenticated;
grant select on public.armani_rp_leaderboard, public.armani_rp_sync_status to anon,authenticated;
grant all on public.armani_rp_leaderboard, public.armani_rp_sync_status to service_role;
drop policy if exists armani_rp_read on public.armani_rp_leaderboard;
create policy armani_rp_read on public.armani_rp_leaderboard for select to anon,authenticated using(true);
drop policy if exists armani_rp_status_read on public.armani_rp_sync_status;
create policy armani_rp_status_read on public.armani_rp_sync_status for select to anon,authenticated using(true);
create or replace function public.armani_sync_rp(p_version bigint,p_entries jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare old_version bigint;
begin
 if p_version is null or p_version<=0 or p_entries is null or jsonb_typeof(p_entries)<>'array' then
  raise exception 'Invalid snapshot';
 end if;
 if jsonb_array_length(p_entries)>10 then raise exception 'Too many entries'; end if;
 select version into old_version from public.armani_rp_sync_status where id=1 for update;
 if old_version is null then raise exception 'Missing sync status'; end if;
 if p_version<=old_version then return false; end if;
 delete from public.armani_rp_leaderboard;
 insert into public.armani_rp_leaderboard(discord_id,nickname,rp_balance,contract_rp_earned,position)
 select x.discord_id,x.nickname,x.rp_balance,x.contract_rp_earned,x.position
 from jsonb_to_recordset(p_entries) as x(discord_id text,nickname text,rp_balance bigint,contract_rp_earned bigint,position integer);
 update public.armani_rp_sync_status set version=p_version,updated_at=now() where id=1;
 return true;
end; $$;
revoke all on function public.armani_sync_rp(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.armani_sync_rp(bigint,jsonb) to service_role;
commit;
