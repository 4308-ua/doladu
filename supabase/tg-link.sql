-- Підключення Telegram за посиланням: у планері «Підключити Telegram» → бот → «Старт» → готово.
-- Планер кладе одноразовий код у tg_link і відкриває t.me/<бот>?start=<код>.
-- Telegram надсилає /start <код> на Edge Function tg-hook, вона записує chat_id, планер його підхоплює.

create extension if not exists pgcrypto;

alter table public.bot_config add column if not exists hook_secret text;
update public.bot_config set hook_secret = encode(extensions.gen_random_bytes(24), 'hex') where id = 1 and hook_secret is null;

create table if not exists public.tg_link (
  code text primary key check (code ~ '^[A-Za-z0-9_-]{16,64}$'),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  chat_id text,
  linked_at timestamptz
);
alter table public.tg_link enable row level security;

drop policy if exists "tg_link own insert" on public.tg_link;
create policy "tg_link own insert" on public.tg_link for insert to authenticated
  with check (user_id = auth.uid() and chat_id is null);
drop policy if exists "tg_link own select" on public.tg_link;
create policy "tg_link own select" on public.tg_link for select to authenticated
  using (user_id = auth.uid());

-- вебхук: Telegram → Edge Function (секрет перевіряється в заголовку)
select net.http_post(
  url := 'https://api.telegram.org/bot' || (select token from public.bot_config where id = 1) || '/setWebhook',
  body := jsonb_build_object(
    'url', 'https://ngxtrzjdpqmozhjeqgqw.supabase.co/functions/v1/tg-hook',
    'secret_token', (select hook_secret from public.bot_config where id = 1),
    'allowed_updates', jsonb_build_array('message')),
  headers := '{"Content-Type": "application/json"}'::jsonb);
