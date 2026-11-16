// Читає чужий календар (iCal) для планера: браузер сам не може через CORS.
// Лише для тих, хто ввійшов (токен перевіряємо тут, verify_jwt = false), лише https і лише відомі сервіси календарів.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ALLOWED = [/^calendar\.google\.com$/, /^(.+\.)?googleusercontent\.com$/, /^outlook\.(live|office|office365)\.com$/, /^(.+\.)?icloud\.com$/];
const MAX = 4_000_000;
const reply = (body: string, status = 200, type = "text/plain; charset=utf-8") => new Response(body, { status, headers: { ...CORS, "Content-Type": type } });

function check(raw: string): URL | null {
  try {
    const url = new URL(raw.replace(/^webcal:/i, "https:"));
    if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
    return ALLOWED.some((re) => re.test(url.hostname.toLowerCase())) ? url : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply("method", 405);
  const auth = req.headers.get("authorization") || "";
  const who = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: KEY, Authorization: auth } });
  if (!who.ok) return reply("auth", 401);

  let raw = "";
  try { raw = String((await req.json()).url || ""); } catch { return reply("host", 400); }
  let url = check(raw);
  if (!url) return reply("host", 400);
  try {
    let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(12000), headers: { "User-Agent": "na-sviy-lad/1.0", Accept: "text/calendar, text/plain;q=0.8" } });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        const next = check(new URL(res.headers.get("location")!, url).toString());
        if (!next) return reply("host", 400);
        url = next;
        continue;
      }
      break;
    }
    if (!res || !res.ok) return reply("upstream " + (res ? res.status : 0), 502);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > MAX) return reply("too big", 502);
    return reply(new TextDecoder().decode(buf), 200, "text/calendar; charset=utf-8");
  } catch {
    return reply("upstream", 502);
  }
});
