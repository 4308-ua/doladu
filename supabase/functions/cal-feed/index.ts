// Розклад із планера як календар-підписка (iCalendar). Адреса: /functions/v1/cal-feed?t=<токен>.
// Токен створює планер («Налаштування → Календарі»); без нього чи з чужим — 404. verify_jwt = false.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const enc = new TextEncoder();

const esc = (s: string) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// рядок не довший за 75 байтів: довші переносяться з пробілом на початку
function fold(line: string): string {
  const out: string[] = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 73) { out.push(cur); cur = " "; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n");
}
const nextDay = (d: string) => {
  const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8) + 1));
  return t.toISOString().slice(0, 10).replace(/-/g, "");
};

Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get("t") || "";
  if (!/^[0-9a-f]{24,64}$/.test(t)) return new Response("not found", { status: 404 });
  const r = await fetch(`${SB}/rest/v1/planner?select=cal:data->cal&data->cal->>token=eq.${t}&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const rows = r.ok ? await r.json() : [];
  const cal = rows[0]?.cal;
  if (!cal || cal.token !== t) return new Response("not found", { status: 404 });

  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const L: string[] = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//na-sviy-lad//planner//UK", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(cal.name || "На свій лад")}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
  ];
  for (const it of Array.isArray(cal.items) ? cal.items.slice(0, 2000) : []) {
    if (!it || typeof it.t !== "string") continue;
    const uid = String(it.u || "").replace(/[^\w.-]/g, "").slice(0, 80);
    if (it.d && /^\d{8}$/.test(it.d)) {
      L.push("BEGIN:VEVENT", `UID:${uid}@na-sviy-lad`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${it.d}`, `DTEND;VALUE=DATE:${nextDay(it.d)}`, `SUMMARY:${esc(it.t)}`, "TRANSP:TRANSPARENT", "END:VEVENT");
    } else if (/^\d{8}T\d{6}Z$/.test(it.a || "") && /^\d{8}T\d{6}Z$/.test(it.b || "")) {
      L.push("BEGIN:VEVENT", `UID:${uid}@na-sviy-lad`, `DTSTAMP:${now}`, `DTSTART:${it.a}`, `DTEND:${it.b}`, `SUMMARY:${esc(it.t)}`, "END:VEVENT");
    }
  }
  L.push("END:VCALENDAR");
  return new Response(L.map(fold).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "max-age=900", "Content-Disposition": 'inline; filename="na-sviy-lad.ics"' },
  });
});
