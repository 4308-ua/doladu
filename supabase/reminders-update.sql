-- Оновлення бота: кнопка «Відкрити планер» у кожному повідомленні, погода в плані дня,
-- дати з «Року» — за день («🔔 Завтра») і в сам день («📅 Сьогодні»).
-- Supabase → SQL Editor → встав усе → Run. Токен бота вставляти НЕ треба — він уже збережений.

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
    out := out || E'\n' || '<code>' || lpad(h::text, 2, '0') || ':00</code>  ' || lad_wicon(c) || ' '
           || case when round(t) > 0 then '+' else '' end || round(t)::int || '°'
           || case when p >= 30 then '  ·  опади ' || p || '%' else '' end;
  end loop;
  if out = '' then return null; end if;
  return '<b>ПОГОДА' || coalesce(' · ' || upper(lad_esc(nullif(city, ''))), '') || '</b>' || out;
end
$f$;

-- повідомлення йдуть як HTML (жирні заголовки, моноширинний час) — текст користувача екрануємо
create or replace function public.lad_esc(t text) returns text
language sql immutable as $f$
  select replace(replace(replace(t, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$f$;

create or replace function public.lad_send(tok text, chat text, txt text) returns void
language plpgsql as $f$
begin
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
    body := jsonb_build_object('chat_id', chat, 'text', txt, 'parse_mode', 'HTML', 'disable_web_page_preview', true,
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
  dtoday text; dtom text; dtxt text;
  ds2 text := to_char((now() at time zone 'Europe/Kyiv')::date + 1, 'YYYY-MM-DD');
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
        txt := '<b>■ ' || case when lead = 0 then 'ЗАРАЗ' when lead = 60 then 'ЧЕРЕЗ ГОДИНУ' else 'ЧЕРЕЗ ' || lead || ' ХВ' end || '</b>'
               || E'\n' || lad_esc(ev->>'title') || E'\n' || '<code>' || lad_hm(st) || '—' || lad_hm(en) || '</code>';
        perform lad_send(tok, chat, txt);
      end loop;
    end if;

    -- дати з «Року»: сьогодні й завтра
    select string_agg('— ' || lad_esc(d->>'text'), E'\n') into dtoday
      from jsonb_array_elements(coalesce(r.data->'dates', '[]'::jsonb)) d where d->>'date' = ds;
    select string_agg('— ' || lad_esc(d->>'text'), E'\n') into dtom
      from jsonb_array_elements(coalesce(r.data->'dates', '[]'::jsonb)) d where d->>'date' = ds2;
    dtxt := nullif(concat_ws(E'\n\n', '<b>СЬОГОДНІ</b>' || E'\n' || dtoday, '<b>ЗАВТРА</b>' || E'\n' || dtom), '');

    if morning < 0 then
      -- план дня вимкнено — дати однаково нагадуємо окремим повідомленням о 9:00
      if dtxt is not null and nowmin >= 540 and nowmin < 543 then
        insert into reminders_sent (user_id, key) values (r.user_id, 'dates:' || ds) on conflict do nothing;
        if found then perform lad_send(tok, chat, dtxt); end if;
      end if;
      continue;
    end if;

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
      select string_agg('<code>' || lad_hm((e->>'start')::int) || '—' || lad_hm((e->>'end')::int) || '</code>  ' || lad_esc(e->>'title'), E'\n' order by (e->>'start')::int), count(*)
        into plan, n
        from jsonb_array_elements(coalesce(r.data->'events', '[]'::jsonb)) e
        where lad_occurs(e, today);
      wtxt := lad_weather_text(wresp, city->>'name');
      txt := '<b>■ ' || upper(days[extract(isodow from today)::int]) || ' · ' || extract(day from today)::int || ' ' || upper(months[extract(month from today)::int]) || '</b>'
             || coalesce(E'\n\n' || wtxt, '')
             || coalesce(E'\n\n' || dtxt, '')
             || E'\n\n' || coalesce('<b>ПЛАН</b>' || E'\n' || plan, 'На сьогодні нічого не заплановано — день вільний.');
      perform lad_send(tok, chat, txt);
    end if;
  end loop;

  delete from reminders_sent where sent_at < now() - interval '3 days';
  delete from weather_req where day < today - 2;
end
$$;
