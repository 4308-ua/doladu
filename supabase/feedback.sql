-- Відгуки з планера: текст + (за бажанням) скриншот.
-- Рядок лягає в public.feedback, картинка — у сховище (бакет feedback), розробнику приходить повідомлення в Telegram.

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  text text not null default '' check (char_length(text) <= 4000),
  image text check (image is null or char_length(image) <= 500),
  meta jsonb
);
alter table public.feedback enable row level security;

-- писати може лише той, хто ввійшов, і лише від свого імені; читати через API не може ніхто (тільки власник бази)
create policy "feedback own insert" on public.feedback for insert to authenticated
  with check (user_id = auth.uid());

-- картинки: публічний бакет, імена файлів випадкові; завантажувати можна лише у свою теку
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('feedback', 'feedback', true, 3000000, array['image/jpeg'])
  on conflict (id) do nothing;
create policy "feedback upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and (storage.foldername(name))[1] = auth.uid()::text);

-- кому писати про новий відгук: chat_id розробника (за замовчуванням — найперший акаунт)
alter table public.bot_config add column if not exists admin_chat text;
update public.bot_config set admin_chat = (
    select nullif(trim(coalesce(data->'tg', data)->'settings'->>'tgChat'), '')
    from public.planner p join auth.users u2 on u2.id = p.user_id order by u2.created_at limit 1)
  where id = 1 and admin_chat is null;

create or replace function public.feedback_notify() returns trigger
language plpgsql security definer set search_path = public as $f$
declare tok text; chat text; who text; body text; recent int;
begin
  select token, admin_chat into tok, chat from bot_config where id = 1;
  if tok is null or chat is null then return new; end if;
  -- не більше 10 сповіщень на людину за годину
  select count(*) into recent from feedback where user_id = new.user_id and created_at > now() - interval '1 hour';
  if recent > 10 then return new; end if;
  select email into who from auth.users where id = new.user_id;
  body := 'ВІДГУК · ' || coalesce(who, '?') || E'\n'
       || coalesce(new.meta->>'tab', '') || ' · ' || coalesce(new.meta->>'screen', '') || E'\n\n'
       || left(coalesce(nullif(new.text, ''), '(без тексту)'), 900);
  if new.image is not null then
    perform net.http_post(url := 'https://api.telegram.org/bot' || tok || '/sendPhoto',
      body := jsonb_build_object('chat_id', chat, 'photo', new.image, 'caption', body),
      headers := '{"Content-Type": "application/json"}'::jsonb);
  else
    perform net.http_post(url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
      body := jsonb_build_object('chat_id', chat, 'text', body, 'disable_web_page_preview', true),
      headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;
  return new;
exception when others then
  return new; -- сповіщення не має ламати сам відгук
end
$f$;

create trigger feedback_notify after insert on public.feedback
  for each row execute function public.feedback_notify();
