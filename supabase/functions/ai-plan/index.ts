// Помічник: фраза (надиктована чи написана) → список дій для планера.
// Лише для тих, хто ввійшов. Ключ Anthropic — секрет ANTHROPIC_API_KEY. Нічого не зберігаємо, крім лічильника запитів.
// Ліміти: AI_DAILY на людину (за замовчуванням 30), AI_GLOBAL на всіх разом (за замовчуванням 600) на добу.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AKEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const MODEL = Deno.env.get("AI_MODEL") || "claude-haiku-5-5";
const DAILY = Number(Deno.env.get("AI_DAILY") || 30);
const GLOBAL = Number(Deno.env.get("AI_GLOBAL") || 600);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

const D = { type: "string", description: "YYYY-MM-DD" };
const T = { type: "string", description: "HH:MM, 24h" };
const TOOL = {
  name: "plan",
  description: "Actions for the planner, built from what the user said.",
  input_schema: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["event", "task", "goal", "progress", "mark", "date", "note", "journal", "habit_done", "habit", "balance", "sleep", "done", "move"] },
            title: { type: "string", description: "Short title in the user's language, first letter capitalized, no date or time inside" },
            date: D, end_date: D, start: T, end: T,
            repeat: { type: "string", enum: ["none", "weekly"] },
            mood: { type: "string", enum: ["good", "mid", "bad"] },
            bonus: { type: "string" },
            minutes: { type: "integer" },
            goal_id: { type: "string" },
            level: { type: "string", enum: ["long", "short", "week"] },
            kind: { type: "string", enum: ["once", "count", "hours", "amount"] },
            target: { type: "number" },
            unit: { type: "string" },
            deadline: D,
            value: { type: "number" },
            date_kind: { type: "string", enum: ["bday", "anniv", "other"] },
            text: { type: "string" },
            mark_id: { type: "string" },
            list: { type: "boolean" },
            habit_id: { type: "string" },
            area_id: { type: "string" },
            event_id: { type: "string" },
            new_date: D,
            per_week: { type: "integer" },
            state: { type: "string" },
            score: { type: "number" },
            gratitude: { type: "string" },
            bed: T, wake: T,
          },
          required: ["type", "title"],
        },
      },
      say: { type: "string", description: "One short sentence in the user's language, only if something was unclear or nothing could be planned" },
    },
    required: ["actions"],
  },
};

const SYSTEM = `You turn what a person said (often dictated by voice, so expect recognition errors and no punctuation) into actions for their personal planner. Call the "plan" tool exactly once.

Action types:
- event: something at a specific time on a specific day → date, start, end. If only a start time is given, take the duration from the words, otherwise 60 minutes. repeat "weekly" only if they say every week / every Monday etc.; for several weekdays make one event per weekday (date = the nearest such day).
- task: a to-do with no time given → goes to the backlog. minutes = duration if mentioned. Do NOT invent a time. Only if they ask you to find a time (e.g. "find time", "put it somewhere tomorrow") make an event in a free slot: inside day_start–day_end, not overlapping "busy", not in the past.
- goal: a new goal. level: long (months or more), short (weeks), week (this week only). kind: once (a single result), count (number of times), hours, amount (money, pages, km; set unit). target = the number. deadline if mentioned. text = the person's own words about the goal, lightly cleaned up; never invent reasons or motivation.
- progress: they report progress on an EXISTING goal ("saved 2000 for the synth", "read a book") → goal_id and value (for once-goals value = 1).
- mark: a multi-day period or a notable day on their Year line (trip, vacation, exam, move) → date, end_date for periods.
- date: a yearly date (birthday, anniversary) → date (use the current year if the year is unknown), date_kind.
- note: something to remember with no time. If it belongs to an existing period (see "periods"), set mark_id; list = true for things to take, buy or do there. Otherwise the note goes to today's diary.
- journal: how they feel today → state (exactly one of "states" from the context, the closest one), score 1–10 for the day if they give one, text = what they said about the day, gratitude = what they are grateful for. Only today. One journal action per request.
- habit_done: they did an EXISTING habit (see "habits") → habit_id, date (today unless they say yesterday). Skip habits already marked for that date in "habits".
- habit: a NEW habit they want to keep → title, per_week (1–7).
- balance: a score for an area of life (see "areas") → area_id, score 0–10. One action per area.
- sleep: when they went to bed and woke up → date = the morning they woke up, bed, wake (either may be missing).
- done: they finished an EXISTING scheduled item (see "events") → event_id and date of that occurrence. Skip items already done.
- move: move an EXISTING scheduled item (see "events") → event_id, date = its current date, new_date, and start/end only if a new time was said.

Rules:
- Ukrainian hours are often said as ordinals: "о дев'ятнадцятій" = 19:00, "до двадцять першої" = 21:00. Voice recognition may write them half in digits: "20 першої" = 21:00, "20 другої" = 22:00, never 20:01.
- Use "today", "weekday" and "now" from the context for relative dates. A weekday name means its nearest future date (today counts if that time has not passed yet). "Evening" ≈ 19:00, "morning" ≈ 09:00, "afternoon" ≈ 14:00, "after work" = right after the busy block that ends latest that day.
- mood for events and tasks: good = pleasant, bad = hard or unpleasant (taxes, dentist, cleaning, difficult calls), mid = neutral. bonus only if they named a reward.
- goal_id: link an event, task or progress to an existing goal only when it clearly serves it.
- "events" holds only the scheduled items whose names resemble words in the request. If they talk about doing or moving something that is not there, do not invent an event_id; make a new event or task instead only if that is clearly what they want, otherwise skip it and say so in "say".
- Titles stay in the person's language and wording, short, without dates or times.
- Never repeat the same action twice. Ignore filler words and greetings.
- If nothing can be planned, return empty actions and a short "say".`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const who = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: SR, Authorization: req.headers.get("authorization") || "" } });
  if (!who.ok) return json({ error: "auth" }, 401);
  const user = await who.json();
  if (!AKEY) return json({ error: "nokey" }, 503);

  let text = "", ctx: unknown = {};
  try {
    const b = await req.json();
    text = String(b.text || "").trim().slice(0, 1500);
    ctx = b.ctx && typeof b.ctx === "object" ? b.ctx : {};
  } catch { return json({ error: "bad" }, 400); }
  if (!text) return json({ error: "empty" }, 400);
  const ctxStr = JSON.stringify(ctx);
  if (ctxStr.length > 20000) return json({ error: "big" }, 400);

  const take = async (k: string, lim: number) => {
    const r = await fetch(`${SB}/rest/v1/rpc/ai_take`, { method: "POST", headers: { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" }, body: JSON.stringify({ p_k: k, p_lim: lim }) });
    return r.ok ? Number(await r.json()) : -1;
  };
  const used = await take(user.id, DAILY);
  if (used < 0) return json({ error: "limit", limit: DAILY }, 429);
  if ((await take("all", GLOBAL)) < 0) return json({ error: "busy" }, 429);

  const body = (forced: boolean) => JSON.stringify({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    tools: [TOOL],
    ...(forced ? { tool_choice: { type: "tool", name: "plan" } } : {}),
    messages: [{ role: "user", content: `Context:\n${ctxStr}\n\nThe person said:\n${text}` }],
  });
  const call = (forced: boolean) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(40000),
    headers: { "x-api-key": AKEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: body(forced),
  });
  try {
    let r = await call(true);
    if (r.status === 400) r = await call(false); // якщо модель не приймає примусовий виклик інструмента
    if (!r.ok) {
      console.log("anthropic", r.status, (await r.text()).slice(0, 300));
      return json({ error: r.status === 401 ? "badkey" : r.status === 402 || r.status === 403 ? "money" : "upstream" }, 502);
    }
    const out = await r.json();
    const use = (out.content || []).find((c: { type: string; name?: string }) => c.type === "tool_use" && c.name === "plan");
    const input = use ? use.input : { actions: [], say: (out.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join(" ").slice(0, 300) };
    const actions = Array.isArray(input.actions) ? input.actions.slice(0, 20) : [];
    return json({ actions, say: typeof input.say === "string" ? input.say.slice(0, 300) : "", left: Math.max(0, DAILY - used) });
  } catch (e) {
    console.log("ai-plan", String(e));
    return json({ error: "upstream" }, 502);
  }
});
