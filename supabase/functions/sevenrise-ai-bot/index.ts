// SevenRise AI Telegram webhook — isolated from the SVR mining bot.
const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_SEVENRISE_BOT_TOKEN")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_SEVENRISE_WEBHOOK_SECRET") ?? "";
const SETUP_SECRET = Deno.env.get("TELEGRAM_SEVENRISE_SETUP_SECRET") ?? TELEGRAM_TOKEN;
const MODEL = Deno.env.get("SEVENRISE_AI_MODEL") ?? "gpt-4o-mini";

const corsHeaders = { "content-type": "application/json; charset=utf-8" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

async function telegram(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(data)}`);
  return data.result;
}

async function sendText(chatId: number, text: string) {
  const chunks = text.match(/[\s\S]{1,3900}/g) ?? [" "];
  for (const chunk of chunks) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
    });
  }
}

async function saveMessage(telegramUserId: number, chatId: number, role: "user" | "assistant", content: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/sevenrise_ai_messages`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({
      telegram_user_id: telegramUserId,
      telegram_chat_id: chatId,
      role,
      content: content.slice(0, 12000),
    }),
  });
  if (!response.ok) throw new Error(`Database insert failed: ${await response.text()}`);
}

async function getHistory(telegramUserId: number) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/sevenrise_ai_messages`);
  url.searchParams.set("select", "role,content");
  url.searchParams.set("telegram_user_id", `eq.${telegramUserId}`);
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", "12");
  const response = await fetch(url, {
    headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!response.ok) throw new Error(`Database history failed: ${await response.text()}`);
  const rows = await response.json();
  return (rows as Array<{ role: "user" | "assistant"; content: string }>).reverse();
}

async function clearHistory(telegramUserId: number) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/sevenrise_ai_messages`);
  url.searchParams.set("telegram_user_id", `eq.${telegramUserId}`);
  const response = await fetch(url, {
    method: "DELETE",
    headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!response.ok) throw new Error(`Database clear failed: ${await response.text()}`);
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("invalid_api_key") || lower.includes("incorrect api key") || lower.includes("401")) {
    return "Kunci OpenAI ditolak. Periksa secret OPENAI_API_KEY di Supabase, pastikan nilainya adalah Secret API key yang aktif, lalu deploy ulang fungsi.";
  }
  if (lower.includes("insufficient_quota") || lower.includes("quota") || lower.includes("billing") || lower.includes("429")) {
    return "Kuota atau billing OpenAI API belum tersedia. Periksa Usage dan Billing di platform.openai.com, lalu coba lagi.";
  }
  if (lower.includes("model") && (lower.includes("not found") || lower.includes("does not exist") || lower.includes("access"))) {
    return "Model AI tidak tersedia untuk project API ini. Periksa secret SEVENRISE_AI_MODEL atau gunakan gpt-4o-mini.";
  }
  if (lower.includes("missing openai_api_key")) {
    return "Secret OPENAI_API_KEY belum terpasang di Supabase.";
  }
  return "SevenRise AI belum dapat menghubungi layanan AI. Admin perlu memeriksa Edge Function Logs di Supabase.";
}

async function askOpenAI(history: Array<{ role: "user" | "assistant"; content: string }>) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.7,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content: "You are SevenRise AI, a helpful, accurate, friendly AI assistant. Reply in the user's language, defaulting to Indonesian. Be clear and practical. Never claim to have performed actions you have not performed. For medical, legal, or financial topics, give careful general information and encourage appropriate professional advice. You are an AI assistant, not the official ChatGPT service.",
        },
        ...history,
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message ?? "OpenAI request failed";
    throw new Error(message);
  }
  const answer = data?.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("AI returned an empty response");
  return answer as string;
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    return json({ ok: true, service: "SevenRise AI Telegram Bot", model: MODEL });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // One-time setup endpoint: POST { "action": "setup" } with x-setup-secret.
  let update: any;
  try {
    update = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (update?.action === "setup") {
    if (!SETUP_SECRET || req.headers.get("x-setup-secret") !== SETUP_SECRET) {
      return json({ error: "Unauthorized setup request" }, 401);
    }
    if (!WEBHOOK_SECRET) return json({ error: "Missing TELEGRAM_SEVENRISE_WEBHOOK_SECRET" }, 500);
    const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
    const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/sevenrise-ai-bot`;
    const result = await telegram("setWebhook", {
      url: webhookUrl,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    });
    return json({ ok: true, webhook_set: result, webhook_url: webhookUrl });
  }

  if (WEBHOOK_SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return json({ error: "Unauthorized webhook request" }, 401);
  }

  const message = update?.message;
  if (!message?.chat?.id || !message?.from?.id) return json({ ok: true, ignored: true });
  const chatId = Number(message.chat.id);
  const userId = Number(message.from.id);
  const text = String(message.text ?? "").trim();
  if (!text) {
    await sendText(chatId, "Saat ini saya menerima pesan teks. Dukungan gambar akan ditambahkan pada pembaruan berikutnya.");
    return json({ ok: true });
  }

  try {
    if (text.startsWith("/start")) {
      await sendText(chatId,
        "✨ Selamat datang di SevenRise AI!\n\nSaya asisten AI yang siap membantu pertanyaan, belajar, coding, ide, dan banyak hal lainnya.\n\nKirim pesan apa saja untuk mulai ngobrol.\n\nPerintah:\n/newchat — mulai percakapan baru\n/help — bantuan"
      );
      return json({ ok: true });
    }
    if (text.startsWith("/help")) {
      await sendText(chatId,
        "🤖 SevenRise AI Help\n\nKirim pertanyaan atau instruksi dalam bahasa apa pun.\n/newchat — hapus konteks percakapan dan mulai dari awal\n/help — tampilkan bantuan\n\nJangan kirim password, API key, atau data rahasia."
      );
      return json({ ok: true });
    }
    if (text.startsWith("/newchat")) {
      await clearHistory(userId);
      await sendText(chatId, "Percakapan baru dimulai. Apa yang ingin kamu bahas?");
      return json({ ok: true });
    }

    await telegram("sendChatAction", { chat_id: chatId, action: "typing" });
    if (!OPENAI_API_KEY) {
      await sendText(chatId, "Secret OPENAI_API_KEY belum terpasang di Supabase. Admin perlu menambahkannya di Edge Function Secrets.");
      return json({ ok: false, error: "Missing OpenAI API key" }, 200);
    }

    // Chat history is optional: database trouble must not block the AI reply.
    let history: Array<{ role: "user" | "assistant"; content: string }> = [];
    try {
      await saveMessage(userId, chatId, "user", text);
      history = await getHistory(userId);
    } catch (historyError) {
      console.error("SevenRise AI history unavailable; continuing without saved history:", historyError);
      history = [{ role: "user", content: text }];
    }

    const answer = await askOpenAI(history);
    try {
      await saveMessage(userId, chatId, "assistant", answer);
    } catch (saveError) {
      console.error("SevenRise AI assistant history save failed:", saveError);
    }
    await sendText(chatId, answer);
    return json({ ok: true });
  } catch (error) {
    console.error("SevenRise AI error:", error);
    await sendText(chatId, "⚠️ " + friendlyError(error));
    return json({ ok: false, error: "Message processing failed" }, 200);
  }
});
