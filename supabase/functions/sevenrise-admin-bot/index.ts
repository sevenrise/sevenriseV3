// SevenRise private admin bot (read-only foundation)
// Required Supabase Edge Function secrets:
// TELEGRAM_ADMIN_BOT_TOKEN, TELEGRAM_ADMIN_ID, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_WEBHOOK_SECRET (recommended).
// Deploy this function, then set the Telegram webhook to:
// https://<project-ref>.supabase.co/functions/v1/sevenrise-admin-bot

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
};

const encoder = new TextEncoder();

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function telegram(method: string, payload: Record<string, unknown>) {
  const token = Deno.env.get("TELEGRAM_ADMIN_BOT_TOKEN");
  if (!token) throw new Error("Missing TELEGRAM_ADMIN_BOT_TOKEN");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    console.error("Telegram API error:", result);
    throw new Error("Telegram API request failed");
  }
  return result;
}

async function supabaseGet(path: string, preferCount = false) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing Supabase server secrets");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      ...(preferCount ? { Prefer: "count=exact" } : {}),
      ...(preferCount ? { Range: "0-0" } : {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Supabase REST error:", response.status, detail);
    throw new Error("Supabase query failed");
  }
  const data = await response.json();
  const range = response.headers.get("content-range");
  const count = range?.includes("/") ? Number(range.split("/")[1]) : null;
  return { data, count };
}

async function sendMenu(chatId: number, text = "🔐 <b>SevenRise Admin Control</b>\nPilih menu:") {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📊 Dashboard", callback_data: "dashboard" }],
        [{ text: "👥 10 Pemain Terbaru", callback_data: "players" }],
        [{ text: "🔎 Cari Pemain", callback_data: "search_help" }],
      ],
    },
  });
}

async function dashboard(chatId: number) {
  const [profiles, claims, sessions] = await Promise.all([
    supabaseGet("profiles?select=id", true),
    supabaseGet("airdrop_claims?select=id", true).catch(() => ({ data: [], count: null })),
    supabaseGet("svr_mining_sessions?select=id", true).catch(() => ({ data: [], count: null })),
  ]);
  const body = [
    "📊 <b>SEVENRISE DASHBOARD</b>",
    "",
    `👥 Total akun: <b>${profiles.count ?? "Tidak tersedia"}</b>`,
    `🎁 Airdrop claims: <b>${claims.count ?? "Tidak tersedia"}</b>`,
    `⛏️ Mining sessions: <b>${sessions.count ?? "Tidak tersedia"}</b>`,
    "",
    "Data dibaca langsung dari Supabase.",
  ].join("\n");
  return sendMenu(chatId, body);
}

async function latestPlayers(chatId: number) {
  const { data } = await supabaseGet(
    "profiles?select=id,username,display_name,telegram_id,points&order=id.desc&limit=10",
  );
  if (!Array.isArray(data) || data.length === 0) {
    return sendMenu(chatId, "Belum ada data pemain, atau tabel profiles belum dapat dibaca.");
  }
  const lines = data.map((p: Record<string, unknown>, i: number) =>
    `${i + 1}. <b>${escapeHtml(p.display_name || p.username || "Tanpa nama")}</b>\n   Telegram ID: ${escapeHtml(p.telegram_id || "-")} · Points: ${escapeHtml(p.points ?? 0)}`
  );
  return sendMenu(chatId, "👥 <b>PEMAIN TERBARU</b>\n\n" + lines.join("\n\n"));
}

async function searchPlayer(chatId: number, term: string) {
  const safe = term.replace(/[,%()]/g, " ").trim().slice(0, 60);
  if (!safe) return sendMenu(chatId, "Format: <code>/search kata_nama_atau_id</code>");
  const filter = encodeURIComponent(`%25${safe}%25`);
  const path = `profiles?select=id,username,display_name,telegram_id,points&or=(username.ilike.${filter},display_name.ilike.${filter},telegram_id.eq.${encodeURIComponent(safe)})&limit=10`;
  const { data } = await supabaseGet(path);
  if (!Array.isArray(data) || data.length === 0) {
    return sendMenu(chatId, `Tidak ditemukan pemain untuk: <b>${escapeHtml(safe)}</b>`);
  }
  const lines = data.map((p: Record<string, unknown>, i: number) =>
    `${i + 1}. <b>${escapeHtml(p.display_name || p.username || "Tanpa nama")}</b>\n   Telegram ID: ${escapeHtml(p.telegram_id || "-")}\n   SVR Points: <b>${escapeHtml(p.points ?? 0)}</b>`
  );
  return sendMenu(chatId, "🔎 <b>HASIL PENCARIAN</b>\n\n" + lines.join("\n\n"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("SevenRise Admin Bot endpoint", { status: 200, headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (expectedSecret) {
    const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (receivedSecret !== expectedSecret) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }
  }

  try {
    const update = await req.json();
    const adminId = Deno.env.get("TELEGRAM_ADMIN_ID") || "1512444619";
    const message = update.message;
    const callback = update.callback_query;
    const fromId = String(message?.from?.id ?? callback?.from?.id ?? "");
    if (fromId !== adminId) {
      // Silently reject all non-admin users. Never reveal that this is an admin bot.
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (callback?.id) {
      await telegram("answerCallbackQuery", { callback_query_id: callback.id });
      const chatId = callback.message?.chat?.id;
      if (chatId) {
        if (callback.data === "dashboard") await dashboard(chatId);
        else if (callback.data === "players") await latestPlayers(chatId);
        else if (callback.data === "search_help") {
          await sendMenu(chatId, "🔎 Cari pemain dengan perintah:\n<code>/search username</code> atau <code>/search telegram_id</code>");
        } else await sendMenu(chatId);
      }
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    const chatId = message?.chat?.id;
    const text = String(message?.text ?? "").trim();
    if (!chatId || !text) return new Response("ok", { status: 200, headers: corsHeaders });

    if (text === "/start" || text === "/menu") await sendMenu(chatId);
    else if (text === "/dashboard") await dashboard(chatId);
    else if (text === "/players") await latestPlayers(chatId);
    else if (text.startsWith("/search")) await searchPlayer(chatId, text.replace(/^\/search\s*/i, ""));
    else await sendMenu(chatId, "Perintah tersedia: /menu, /dashboard, /players, /search nama_atau_id");
  } catch (error) {
    console.error("SevenRise admin bot error:", error);
    // Avoid exposing internal details to Telegram users.
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});
