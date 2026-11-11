// Вебхук бота «На свій лад»: /start <код> привʼязує Telegram до акаунта планера.
// Деплой: verify_jwt = false (Telegram не надсилає JWT); справжність — заголовок X-Telegram-Bot-Api-Secret-Token.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP = "https://4308-ua.github.io/doladu/";

const db = (path: string, init: RequestInit = {}) =>
  fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });

let cfg: { token: string; hook_secret: string } | null = null;
async function config() {
  if (!cfg) {
    const r = await db("bot_config?id=eq.1&select=token,hook_secret");
    cfg = (await r.json())[0] || null;
  }
  return cfg;
}

async function send(token: string, chat: number | string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chat,
      text,
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: "Відкрити «На свій лад» →", url: APP }]] },
    }),
  });
}

const HELP =
  "Я надсилаю нагадування з планера «На свій лад»: перед справами, план на день з погодою і дати з «Року».\n\n" +
  "Щоб підключити: відкрий планер → ⚙ Налаштування → «Підключити Telegram».";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const c = await config();
  if (!c || req.headers.get("x-telegram-bot-api-secret-token") !== c.hook_secret) {
    return new Response("forbidden", { status: 403 });
  }
  let upd: any;
  try { upd = await req.json(); } catch { return new Response("ok"); }
  const msg = upd?.message;
  const chat = msg?.chat?.id;
  const text: string = (msg?.text || "").trim();
  if (!chat || msg.chat.type !== "private") return new Response("ok");

  try {
    const m = text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{16,64}))?$/);
    if (m && m[1]) {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const r = await db(
        `tg_link?code=eq.${m[1]}&chat_id=is.null&created_at=gte.${since}`,
        { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ chat_id: String(chat), linked_at: new Date().toISOString() }) },
      );
      const rows = r.ok ? await r.json() : [];
      if (rows.length) {
        await send(c.token, chat,
          "✅ Готово, Telegram підключено!\n\nПовернись у планер — він підхопить це сам. " +
          "Далі я писатиму: перед справами, зранку план на день і про дати з «Року» — за день і в сам день.");
      } else {
        await send(c.token, chat,
          "Посилання застаріло або вже використане. Відкрий планер → ⚙ Налаштування → «Підключити Telegram» ще раз.");
      }
      // прибираємо старі коди
      await db(`tg_link?created_at=lt.${new Date(Date.now() - 24 * 3600 * 1000).toISOString()}`, { method: "DELETE" });
    } else if (/^\/stop/.test(text)) {
      await send(c.token, chat, "Щоб вимкнути нагадування: планер → ⚙ Налаштування → Telegram → «Відключити».");
    } else {
      await send(c.token, chat, HELP);
    }
  } catch (e) {
    console.error(e);
  }
  return new Response("ok");
});
