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

-- запити погоди (відповідь приходить асинхронно в net._http_response)
create table if not exists public.weather_req (
  user_id uuid not null,
  day date not null,
  req_id bigint not null,
  primary key (user_id, day)
);
alter table public.weather_req enable row level security;

create or replace function public.lad_wicon(c int) returns text
language sql immutable as $f$
  select case
    when c = 0 then '☀️' when c in (1, 2) then '🌤' when c = 3 then '☁️'
    when c in (45, 48) then '🌫' when c between 51 and 57 then '🌦'
    when c between 61 and 67 or c between 80 and 82 then '🌧'
    when c between 71 and 77 or c in (85, 86) then '🌨'
    when c >= 95 then '⛈' else '·' end
$f$;

-- кілька основних годин дня: значок, температура, імовірність опадів
create or replace function public.lad_weather_text(resp jsonb, city text) returns text
language plpgsql immutable as $f$
declare h int; t numeric; p int; c int; out text := '';
begin
  if resp is null or resp->'hourly' is null then return null; end if;
  foreach h in array array[9, 12, 15, 18, 21] loop
    t := (resp->'hourly'->'temperature_2m'->>h)::numeric;
    continue when t is null;
    p := coalesce((resp->'hourly'->'precipitation_probability'->>h)::int, 0);
    c := coalesce((resp->'hourly'->'weather_code'->>h)::int, -1);
    out := out || E'\n' || lpad(h::text, 2, '0') || ':00  ' || lad_wicon(c) || ' '
           || case when round(t) > 0 then '+' else '' end || round(t)::int || '°'
           || case when p >= 30 then '  💧' || p || '%' else '' end;
  end loop;
  if out = '' then return null; end if;
  return '🌡 Погода' || coalesce(', ' || nullif(city, ''), '') || ':' || out;
end
$f$;

create or replace function public.lad_send(tok text, chat text, txt text) returns void
language plpgsql as $f$
begin
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
    body := jsonb_build_object('chat_id', chat, 'text', txt, 'disable_web_page_preview', true,
      'reply_markup', jsonb_build_object('inline_keyboard', jsonb_build_array(jsonb_build_array(
        jsonb_build_object('text', 'Відкрити «На свій лад» →', 'url', 'https://4308-ua.github.io/doladu/'))))),
    headers := '{"Content-Type": "application/json"}'::jsonb);
end
$f$;

create or replace function public.send_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  tok text;
  r record;
  ev jsonb;
  chat text;
  lead int;
  morning int;
  city jsonb;
  rid bigint;
  wresp jsonb;
  wtxt text;
  today date := (now() at time zone 'Europe/Kyiv')::date;
  nowmin int := extract(hour from now() at time zone 'Europe/Kyiv')::int * 60 + extract(minute from now() at time zone 'Europe/Kyiv')::int;
  ds text := to_char((now() at time zone 'Europe/Kyiv')::date, 'YYYY-MM-DD');
  st int; en int; due int; txt text; plan text; n int;
  days text[] := array['Понеділок','Вівторок','Середа','Четвер','Пʼятниця','Субота','Неділя'];
  months text[] := array['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
begin
  select token into tok from bot_config where id = 1;
  if tok is null or tok like 'ВСТАВ%' then return; end if;

  -- нова версія планера шифрує дані; для нагадувань вона окремо кладе розклад у data->'tg'
  for r in select user_id, coalesce(data->'tg', data) as data from planner loop
    chat := nullif(trim(r.data->'settings'->>'tgChat'), '');
    continue when chat is null;
    lead := coalesce((r.data->'settings'->>'remindBefore')::int, 10);
    morning := coalesce((r.data->'settings'->>'morningAt')::int, 480);
    city := r.data->'settings'->'city';
    if city is not null and (city->>'lat') is null then city := null; end if;

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
        perform lad_send(tok, chat, txt);
      end loop;
    end if;

    if morning < 0 then continue; end if;

    -- погода: за 10 хв до плану дня просимо прогноз (відповідь прийде за кілька секунд)
    if city is not null and nowmin >= morning - 10 and nowmin < morning + 3
       and not exists (select 1 from weather_req w where w.user_id = r.user_id and w.day = today) then
      rid := net.http_get(url := 'https://api.open-meteo.com/v1/forecast?latitude=' || (city->>'lat') || '&longitude=' || (city->>'lon')
             || '&hourly=temperature_2m,precipitation_probability,weather_code&timezone=auto&forecast_days=1');
      insert into weather_req (user_id, day, req_id) values (r.user_id, today, rid) on conflict do nothing;
    end if;

    -- план на день (+ погода, якщо вказано місто)
    if nowmin >= morning and nowmin < morning + 3
       and not exists (select 1 from reminders_sent s where s.user_id = r.user_id and s.key = 'day:' || ds) then
      wresp := null;
      if city is not null then
        begin
          select case when h.status_code = 200 then h.content::jsonb end into wresp
            from weather_req w join net._http_response h on h.id = w.req_id
            where w.user_id = r.user_id and w.day = today;
        exception when others then wresp := null;
        end;
        -- прогноз ще не прийшов — чекаємо до 2 хв, потім шлемо без нього
        continue when wresp is null and nowmin < morning + 2;
      end if;
      insert into reminders_sent (user_id, key) values (r.user_id, 'day:' || ds) on conflict do nothing;
      select string_agg(lad_hm((e->>'start')::int) || '—' || lad_hm((e->>'end')::int) || '  ' || (e->>'title'), E'\n' order by (e->>'start')::int), count(*)
        into plan, n
        from jsonb_array_elements(coalesce(r.data->'events', '[]'::jsonb)) e
        where lad_occurs(e, today);
      wtxt := lad_weather_text(wresp, city->>'name');
      txt := '☀️ ' || days[extract(isodow from today)::int] || ', ' || extract(day from today)::int || ' ' || months[extract(month from today)::int]
             || coalesce(E'\n\n' || wtxt, '')
             || E'\n\n' || coalesce('📋 План:' || E'\n' || plan, 'Сьогодні нічого не заплановано.');
      perform lad_send(tok, chat, txt);
    end if;
  end loop;

  delete from reminders_sent where sent_at < now() - interval '3 days';
  delete from weather_req where day < today - 2;
end
$$;

-- щохвилини
select cron.unschedule('lad-reminders') where exists (select 1 from cron.job where jobname = 'lad-reminders');
select cron.schedule('lad-reminders', '* * * * *', 'select public.send_reminders()');
