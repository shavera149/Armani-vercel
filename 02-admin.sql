-- Owner Discord ID supplied by you. Run after 01-schema.sql.
insert into armani_private.admin_discord_ids(discord_id)
values ('768426180709711882')
on conflict do nothing;
-- To revoke later, delete the corresponding allowlist row in SQL Editor.
