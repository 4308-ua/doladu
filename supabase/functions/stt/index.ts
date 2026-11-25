// Розпізнавання мови для браузерів, де вбудоване не працює (Opera, Brave…): запис → Groq Whisper → текст.
// Лише для тих, хто ввійшов. Ключ — секрет GROQ_API_KEY (безкоштовний на console.groq.com). Звук не зберігаємо.
// Ліміти: STT_DAILY на людину (60), STT_GLOBAL на всіх (1500) за добу; лічильник той самий, що в помічника.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GKEY = Deno.env.get("GROQ_API_KEY") || "";
const MODEL = Deno.env.get("STT_MODEL") || "whisper-large-v3";
const DAILY = Number(Deno.env.get("STT_DAILY") || 60);
const GLOBAL = Number(Deno.env.get("STT_GLOBAL") || 1500);
const MAX = 8_000_000;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/aac": "m4a" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const who = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: SR, Authorization: req.headers.get("authorization") || "" } });
  if (!who.ok) return json({ error: "auth" }, 401);
  const user = await who.json();
  if (!GKEY) return json({ error: "nokey" }, 503);

  const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = EXT[type];
  if (!ext) return json({ error: "type" }, 400);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length < 800) return json({ error: "short" }, 400);
  if (buf.length > MAX) return json({ error: "big" }, 400);

  const take = async (k: string, lim: number) => {
    const r = await fetch(`${SB}/rest/v1/rpc/ai_take`, { method: "POST", headers: { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" }, body: JSON.stringify({ p_k: k, p_lim: lim }) });
    return r.ok ? Number(await r.json()) : -1;
  };
  if ((await take("stt:" + user.id, DAILY)) < 0) return json({ error: "limit", limit: DAILY }, 429);
  if ((await take("stt:all", GLOBAL)) < 0) return json({ error: "busy" }, 429);

  const form = new FormData();
  form.append("file", new Blob([buf], { type }), "voice." + ext);
  form.append("model", MODEL);
  form.append("language", "uk");
  form.append("temperature", "0");
  form.append("response_format", "json");
  // підказка про тему й пунктуацію: Whisper тоді ставить коми й пише слова планера правильно
  form.append("prompt", "Планер: справи, цілі, нотатки.");
  try {
    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + GKEY }, body: form, signal: AbortSignal.timeout(30000) });
    if (!r.ok) {
      console.log("groq", r.status, (await r.text()).slice(0, 300));
      return json({ error: r.status === 401 ? "badkey" : r.status === 429 ? "busy" : "upstream" }, 502);
    }
    const out = await r.json();
    let text = String(out.text || "").trim();
    // на тиші Whisper інколи повертає підказку або «дякую за перегляд»
    if (/^(планер:?\s*справи, цілі, нотатки\.?|дякую за перегляд.*|субтитри.*|продовження буде.*)$/i.test(text)) text = "";
    return json({ text: text.slice(0, 2000) });
  } catch (e) {
    console.log("stt", String(e));
    return json({ error: "upstream" }, 502);
  }
});
