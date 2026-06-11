-- Poker room state for the deployed mini game.
-- Run once in the Supabase SQL editor for the shared project.

create table if not exists public.poker_rooms (
  room_code text primary key,
  state_json jsonb not null,
  version int4 not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

insert into public.poker_rooms (room_code, state_json, expires_at)
values
  ('1001', '{"roomCode":"1001","players":[],"street":"waiting"}', now() + interval '30 minutes'),
  ('1002', '{"roomCode":"1002","players":[],"street":"waiting"}', now() + interval '30 minutes'),
  ('1003', '{"roomCode":"1003","players":[],"street":"waiting"}', now() + interval '30 minutes'),
  ('1004', '{"roomCode":"1004","players":[],"street":"waiting"}', now() + interval '30 minutes')
on conflict (room_code) do nothing;

create or replace function public.update_poker_rooms_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_poker_rooms_updated_at on public.poker_rooms;

create trigger trg_poker_rooms_updated_at
before update on public.poker_rooms
for each row
execute function public.update_poker_rooms_updated_at();

alter table public.poker_rooms enable row level security;
