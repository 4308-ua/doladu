-- Діагностика бота. Supabase → SQL Editor → встав → Run → скопіюй таблицю результату.
-- Токен і chat ID тут не показуються.
with j as (select jobid, active, schedule from cron.job where jobname = 'lad-reminders')
select * from (
  select 1 as n, 'job' as what,
         coalesce((select 'active=' || active || ' schedule=' || schedule from j), 'НЕМАЄ задачі lad-reminders') as info,
         null::text as at
  union all
  select 2, 'token', case when t.token is null then 'немає' when t.token like 'ВСТАВ%' then 'не вставлено'
                          else 'є (' || length(t.token) || ' символів, формат ' || case when t.token ~ '^\d+:[\w-]{30,}$' then 'ок' else 'дивний' end || ')' end, null
    from (select (select token from bot_config where id = 1) as token) t
  union all
  select 3, 'planner', 'tg=' || (data ? 'tg') || ' chat=' || coalesce(nullif(trim(coalesce(data->'tg', data)->'settings'->>'tgChat'), '') is not null, false)
         || ' events=' || coalesce(jsonb_array_length(coalesce(data->'tg', data)->'events'), 0)
         || ' morningAt=' || coalesce(coalesce(data->'tg', data)->'settings'->>'morningAt', '-')
         || ' remindBefore=' || coalesce(coalesce(data->'tg', data)->'settings'->>'remindBefore', '-')
         || ' city=' || (coalesce(data->'tg', data)->'settings'->'city'->>'lat' is not null),
         updated_at::text
    from planner
  union all
  select * from (select 4, 'cron-run', status || ' ' || left(coalesce(return_message, ''), 200), start_time::text
    from cron.job_run_details where jobid in (select jobid from j) order by start_time desc limit 5) c
  union all
  select * from (select 5, 'http', coalesce(status_code::text, 'null') || ' ' || coalesce(left(error_msg, 120), '')
         || ' ' || left(coalesce(content, ''), 160) || case when timed_out then ' TIMEOUT' else '' end, created::text
    from net._http_response order by created desc limit 6) h
  union all
  select * from (select 6, 'sent', key, sent_at::text from reminders_sent order by sent_at desc limit 4) s
) x order by n, at desc nulls first;
