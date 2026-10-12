-- Нагадування в Telegram для «На свій лад».
-- Вставити в Supabase → SQL Editor, у першому рядку після «-- ТОКЕН» підставити токен бота від @BotFather → Run.
-- Що робить: щохвилини дивиться розклад кожного користувача (таблиця planner) і пише в Telegram:
--   • «Через N хв: справа» — за стільки хвилин, скільки вибрано в Налаштуваннях планера;
--   • план на день — о вибраній годині.
-- Час рахується за Києвом.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- токен бота: таблиця без жодних правил доступу — з сайту її не прочитати
create table if not exists public.bot_config (id int primary key default 1, token text not null);
alter table public.bot_config enable row level security;
-- ТОКЕН ↓ (заміни текст у лапках на свій токен, напр. 7123456789:AAH...)
insert into public.bot_config (id, token) values (1, 'ВСТАВ_СЮДИ_ТОКЕН_БОТА')
  on conflict (id) do update set token = excluded.token;

-- що вже надіслано (щоб не повторювати)
create table if not exists public.reminders_sent (
  user_id uuid not null,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.reminders_sent enable row level security;

-- чи є справа в цей день: разова — у свою дату; щотижнева — кожні 7 днів від дати, до «until», крім пропущених
create or replace function public.lad_occurs(ev jsonb, d date) returns boolean
language sql immutable as $$
  select case
    when ev->>'repeat' = 'weekly' then
      (ev->>'date')::date <= d
      and ((d - (ev->>'date')::date) % 7) = 0
      and (ev->>'until' is null or (ev->>'until')::date >= d)
      and not coalesce(ev->'skipDates' ? to_char(d, 'YYYY-MM-DD'), false)
    else (ev->>'date')::date = d
  end
$$;

create or replace function public.lad_hm(m int) returns text
language sql immutable as $$ select lpad((m / 60)::text, 2, '0') || ':' || lpad((m % 60)::text, 2, '0') $$;

create or replace function public.send_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  tok text;
  r record;
  ev jsonb;
  chat text;
  lead int;
  morning int;
  now_k timestamp := now() at time zone 'Europe/Kyiv';
  today date := (now() at time zone 'Europe/Kyiv')::date;
  nowmin int := extract(hour from now() at time zone 'Europe/Kyiv')::int * 60 + extract(minute from now() at time zone 'Europe/Kyiv')::int;
  ds text := to_char((now() at time zone 'Europe/Kyiv')::date, 'YYYY-MM-DD');
  st int; en int; due int; txt text; plan text; n int;
  days text[] := array['Понеділок','Вівторок','Середа','Четвер','Пʼятниця','Субота','Неділя'];
  months text[] := array['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
begin
  select token into tok from bot_config where id = 1;
  if tok is null or tok like 'ВСТАВ%' then return; end if;

  for r in select user_id, data from planner loop
    chat := nullif(trim(r.data->'settings'->>'tgChat'), '');
    continue when chat is null;
    lead := coalesce((r.data->'settings'->>'remindBefore')::int, 10);
    morning := coalesce((r.data->'settings'->>'morningAt')::int, 480);

    -- нагадування перед справою (вікно 3 хв — якщо запуск трохи запізнився)
    if lead >= 0 then
      for ev in select e from jsonb_array_elements(coalesce(r.data->'events', '[]'::jsonb)) e loop
        continue when not lad_occurs(ev, today);
        continue when coalesce(ev->'doneDates' ? ds, false);
        st := (ev->>'start')::int; en := (ev->>'end')::int;
        due := st - lead;
        continue when not (due <= nowmin and due > nowmin - 3 and st >= nowmin - 1);
        insert into reminders_sent (user_id, key) values (r.user_id, 'ev:' || (ev->>'id') || ':' || ds)
          on conflict do nothing;
        continue when not found;
        txt := case when lead = 0 then '⏰ Зараз: ' else '⏰ Через ' || case when lead = 60 then 'годину' else lead || ' хв' end || ': ' end
               || (ev->>'title') || E'\n' || lad_hm(st) || '—' || lad_hm(en);
        perform net.http_post(
          url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
          body := jsonb_build_object('chat_id', chat, 'text', txt),
          headers := '{"Content-Type": "application/json"}'::jsonb);
      end loop;
    end if;

    -- план на день
    if morning >= 0 and nowmin >= morning and nowmin < morning + 3 then
      insert into reminders_sent (user_id, key) values (r.user_id, 'day:' || ds) on conflict do nothing;
      if found then
        select string_agg(lad_hm((e->>'start')::int) || '—' || lad_hm((e->>'end')::int) || '  ' || (e->>'title'), E'\n' order by (e->>'start')::int), count(*)
          into plan, n
          from jsonb_array_elements(coalesce(r.data->'events', '[]'::jsonb)) e
          where lad_occurs(e, today);
        txt := '☀️ ' || days[extract(isodow from today)::int] || ', ' || extract(day from today)::int || ' ' || months[extract(month from today)::int]
               || E'\n\n' || coalesce(plan, 'Сьогодні нічого не заплановано.');
        perform net.http_post(
          url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
          body := jsonb_build_object('chat_id', chat, 'text', txt),
          headers := '{"Content-Type": "application/json"}'::jsonb);
      end if;
    end if;
  end loop;

  delete from reminders_sent where sent_at < now() - interval '3 days';
end
$$;

-- щохвилини
select cron.unschedule('lad-reminders') where exists (select 1 from cron.job where jobname = 'lad-reminders');
select cron.schedule('lad-reminders', '* * * * *', 'select public.send_reminders()');
