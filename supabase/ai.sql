-- Помічник (функція ai-plan): лічильник запитів на день, щоб не перевищити бюджет.
-- k = id користувача або 'all' для загального ліміту.
create table if not exists public.ai_usage (
  k   text not null,
  day date not null default (now() at time zone 'Europe/Kyiv')::date,
  n   int  not null default 0,
  primary key (k, day)
);
alter table public.ai_usage enable row level security; -- політик немає: доступ лише з service role

-- +1 до лічильника; повертає нове значення або -1, якщо ліміт уже вичерпано
create or replace function public.ai_take(p_k text, p_lim int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into ai_usage (k, day, n) values (p_k, (now() at time zone 'Europe/Kyiv')::date, 1)
  on conflict (k, day) do update set n = ai_usage.n + 1 where ai_usage.n < p_lim
  returning n into v;
  return coalesce(v, -1);
end $$;
revoke all on function public.ai_take(text, int) from public, anon, authenticated;
grant execute on function public.ai_take(text, int) to service_role;
