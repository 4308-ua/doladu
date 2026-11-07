-- Оновлення нагадувань для зашифрованої версії планера.
-- Supabase → SQL Editor → встав усе → Run. Токен бота вставляти НЕ треба — він уже збережений.

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

  -- нова версія планера шифрує дані; для нагадувань вона окремо кладе розклад у data->'tg'
  for r in select user_id, coalesce(data->'tg', data) as data from planner loop
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
