// SevenRise private Super Admin bot.
// Server-side authorization is restricted to Telegram user/chat ID 1512444619.
// Secrets: TELEGRAM_ADMIN_BOT_TOKEN, TELEGRAM_ADMIN_ID, TELEGRAM_WEBHOOK_SECRET,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TON_TREASURY_WALLET (for /paid),
// TONCENTER_API_KEY (optional).

import { Address } from "https://esm.sh/@ton/core@0.59.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
};

const encoder = new TextEncoder();

function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function normalizeAddress(value: string): string {
  return Address.parse(value).toRawString().toLowerCase();
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function telegram(method: string, payload: Record<string, unknown>) {
  const token = Deno.env.get("TELEGRAM_ADMIN_BOT_TOKEN");
  if (!token) throw new Error("Missing Telegram admin bot token");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error("Telegram API request failed");
  return result;
}

function supabaseConfig() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase server secrets are missing");
  return { url, key };
}

async function supabaseGet(path: string, preferCount = false) {
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key, authorization: `Bearer ${key}`,
      ...(preferCount ? { Prefer: "count=exact", Range: "0-0" } : {}),
    },
  });
  if (!response.ok) throw new Error("Supabase query failed");
  const data = await response.json();
  const range = response.headers.get("content-range");
  const count = range?.includes("/") ? Number(range.split("/")[1]) : null;
  return { data, count };
}

async function supabasePatch(path: string, body: Record<string, unknown>) {
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: key, authorization: `Bearer ${key}`,
      "content-type": "application/json", Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error("Supabase PATCH failed:", response.status, await response.text());
    throw new Error("Perubahan database gagal.");
  }
  return await response.json();
}

async function supabaseRpc(name: string, args: Record<string, unknown>) {
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Supabase RPC failed:", response.status, body);
    throw new Error(String(body?.message || "Penyelesaian payout gagal."));
  }
  return body;
}

async function sendMenu(chatId: number, message = "🔐 <b>SevenRise Admin Control</b>\nPilih menu:") {
  return telegram("sendMessage", {
    chat_id: chatId, text: message, parse_mode: "HTML",
    reply_markup: { inline_keyboard: [
      [{ text: "📊 Dashboard", callback_data: "dashboard" }],
      [{ text: "👥 10 Pemain Terbaru", callback_data: "players" }],
      [{ text: "🔎 Cari Pemain", callback_data: "search_help" }],
      [{ text: "💸 Permintaan Penarikan", callback_data: "withdrawals" }],
    ] },
  });
}

async function dashboard(chatId: number) {
  const [profiles, claims, sessions, withdrawals] = await Promise.all([
    supabaseGet("profiles?select=id", true),
    supabaseGet("airdrop_claims?select=id", true).catch(() => ({ data: [], count: null })),
    supabaseGet("svr_mining_sessions?select=id", true).catch(() => ({ data: [], count: null })),
    supabaseGet("svr_withdrawal_requests?select=id", true).catch(() => ({ data: [], count: null })),
  ]);
  const body = [
    "📊 <b>SEVENRISE DASHBOARD</b>", "",
    `👥 Total akun: <b>${profiles.count ?? "N/A"}</b>`,
    `🎁 Airdrop claims: <b>${claims.count ?? "N/A"}</b>`,
    `⛏️ Mining sessions: <b>${sessions.count ?? "N/A"}</b>`,
    `💸 Withdrawal requests: <b>${withdrawals.count ?? "N/A"}</b>`,
  ].join("\n");
  return sendMenu(chatId, body);
}

async function latestPlayers(chatId: number) {
  const { data } = await supabaseGet("profiles?select=id,username,display_name,telegram_id,points&order=id.desc&limit=10");
  if (!Array.isArray(data) || !data.length) return sendMenu(chatId, "Belum ada data pemain.");
  const lines = data.map((p: Record<string, unknown>, i: number) =>
    `${i + 1}. <b>${escapeHtml(p.display_name || p.username || "Tanpa nama")}</b>\n   Telegram ID: ${escapeHtml(p.telegram_id || "-")} · Points: ${escapeHtml(p.points ?? 0)}`
  );
  return sendMenu(chatId, "👥 <b>PEMAIN TERBARU</b>\n\n" + lines.join("\n\n"));
}

async function withdrawalRequests(chatId: number) {
  const { data } = await supabaseGet("svr_withdrawal_requests?select=id,points_amount,usdt_value,ton_amount,wallet_address,status,fee_tx_hash,created_at&order=created_at.desc&limit=10");
  if (!Array.isArray(data) || !data.length) return sendMenu(chatId, "💸 <b>PERMINTAAN PENARIKAN</b>\n\nBelum ada permintaan.");
  const lines = data.map((r: Record<string, unknown>, i: number) =>
    `${i + 1}. <b>${escapeHtml(r.status)}</b> · ${escapeHtml(r.points_amount)} Points\n   ${Number(r.ton_amount || 0).toFixed(4)} TON / ${Number(r.usdt_value || 0).toFixed(4)} USDT\n   Wallet: <code>${escapeHtml(r.wallet_address)}</code>\n   Fee TX: <code>${escapeHtml(r.fee_tx_hash || "Belum diverifikasi")}</code>\n   ID: <code>${escapeHtml(r.id)}</code>`
  );
  return sendMenu(chatId, "💸 <b>10 PERMINTAAN PENARIKAN TERBARU</b>\n\n" + lines.join("\n\n") +
    "\n\nPerintah admin:\n<code>/approve ID</code> setelah fee_verified / pending_admin\n<code>/reject ID alasan</code> untuk menolak\n<code>/paid ID TX_HASH</code> setelah TON benar-benar dikirim dari treasury.");
}

async function searchPlayer(chatId: number, term: string) {
  const safe = term.replace(/[,%()]/g, " ").trim().slice(0, 60);
  if (!safe) return sendMenu(chatId, "Format: <code>/search username_atau_id</code>");
  const filter = encodeURIComponent(`%25${safe}%25`);
  const path = `profiles?select=id,username,display_name,telegram_id,points&or=(username.ilike.${filter},display_name.ilike.${filter},telegram_id.eq.${encodeURIComponent(safe)})&limit=10`;
  const { data } = await supabaseGet(path);
  if (!Array.isArray(data) || !data.length) return sendMenu(chatId, "Pemain tidak ditemukan.");
  const lines = data.map((p: Record<string, unknown>, i: number) =>
    `${i + 1}. <b>${escapeHtml(p.display_name || p.username || "Tanpa nama")}</b>\nTelegram ID: ${escapeHtml(p.telegram_id || "-")}\nSVR Points: <b>${escapeHtml(p.points ?? 0)}</b>`
  );
  return sendMenu(chatId, "🔎 <b>HASIL PENCARIAN</b>\n\n" + lines.join("\n\n"));
}

async function approveWithdrawal(chatId: number, requestId: string) {
  if (!uuid(requestId)) return sendMenu(chatId, "Format: <code>/approve REQUEST_UUID</code>");
  const rows = await supabasePatch(
    `svr_withdrawal_requests?id=eq.${requestId}&status=eq.pending_admin`,
    { status: "approved", admin_note: "Approved by Telegram Super Admin", updated_at: new Date().toISOString() },
  );
  if (!Array.isArray(rows) || !rows.length) return sendMenu(chatId, "Tidak dapat menyetujui. Pastikan fee sudah diverifikasi dan status masih pending_admin.");
  return sendMenu(chatId, "✅ Permintaan disetujui. Belum dibayar. Kirim TON dari treasury secara manual, lalu jalankan /paid dengan hash transaksi.");
}

async function rejectWithdrawal(chatId: number, requestId: string, reason: string) {
  if (!uuid(requestId)) return sendMenu(chatId, "Format: <code>/reject REQUEST_UUID alasan</code>");
  const rows = await supabasePatch(
    `svr_withdrawal_requests?id=eq.${requestId}&status=in.(pending_fee,fee_verified,pending_admin)`,
    { status: "rejected", admin_note: (reason || "Rejected by Telegram Super Admin").slice(0, 500), updated_at: new Date().toISOString() },
  );
  if (!Array.isArray(rows) || !rows.length) return sendMenu(chatId, "Tidak dapat menolak. Status mungkin sudah berubah atau pembayaran sudah disetujui.");
  return sendMenu(chatId, "Permintaan ditolak. Poin yang direservasi kembali tersedia.");
}

async function markWithdrawalPaid(chatId: number, requestId: string, txHash: string) {
  if (!uuid(requestId) || !/^[0-9a-f]{64}$/i.test(txHash)) {
    return sendMenu(chatId, "Format: <code>/paid REQUEST_UUID TRANSACTION_HASH</code>");
  }
  const treasury = Deno.env.get("TON_TREASURY_WALLET");
  if (!treasury) return sendMenu(chatId, "TON_TREASURY_WALLET belum dikonfigurasi sebagai Supabase secret. Tidak ada status paid yang akan diubah.");
  const { data } = await supabaseGet(
    `svr_withdrawal_requests?select=id,status,ton_amount,wallet_address,payout_tx_hash&id=eq.${requestId}`,
  );
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || row.status !== "approved" || row.payout_tx_hash) {
    return sendMenu(chatId, "Permintaan tidak ditemukan, belum disetujui, atau sudah dibayar.");
  }

  const params = new URLSearchParams({ account: treasury, hash: txHash.toLowerCase(), limit: "10" });
  const apiKey = Deno.env.get("TONCENTER_API_KEY");
  const chainResponse = await fetch(`https://toncenter.com/api/v3/transactions?${params.toString()}`, {
    headers: { accept: "application/json", ...(apiKey ? { "X-API-Key": apiKey } : {}) },
  });
  if (!chainResponse.ok) return sendMenu(chatId, "TON Center belum dapat memeriksa transaksi. Coba lagi.");
  const chainData = await chainResponse.json();
  const txs = Array.isArray(chainData?.transactions) ? chainData.transactions : [];
  const expectedRecipient = normalizeAddress(String(row.wallet_address));
  const expectedTreasury = normalizeAddress(treasury);
  const expectedNano = BigInt(Math.round(Number(row.ton_amount) * 1_000_000_000));
  const match = txs.find((tx: Record<string, unknown>) => {
    try {
      if (normalizeAddress(String(tx.account)) !== expectedTreasury) return false;
      const description = tx.description as Record<string, unknown> | undefined;
      if (description?.aborted !== false) return false;
      const action = description?.action as Record<string, unknown> | undefined;
      if (action?.success !== true) return false;
      const out = Array.isArray(tx.out_msgs) ? tx.out_msgs : [];
      return out.some((msg: Record<string, unknown>) =>
        normalizeAddress(String(msg.destination)) === expectedRecipient &&
        BigInt(String(msg.value ?? "0")) === expectedNano &&
        msg.bounced === false
      );
    } catch { return false; }
  });
  if (!match) return sendMenu(chatId, "Hash belum terbukti mengirim jumlah TON yang tepat dari treasury ke wallet penerima. Status tetap approved.");

  const finalized = await supabaseRpc("svr_finalize_withdrawal_payout", {
    input_request_id: requestId,
    input_tx_hash: txHash.toLowerCase(),
  });
  if (!finalized || finalized.success !== true) return sendMenu(chatId, "Transaksi terverifikasi tetapi penyelesaian database belum berhasil. Periksa permintaan secara manual.");
  return sendMenu(chatId, "✅ Pembayaran TON terverifikasi di blockchain. Status PAID dan " +
    escapeHtml(finalized.points_debited) + " SVR Points telah dipotong secara atomik.");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("SevenRise Admin Bot endpoint", { status: 200, headers: corsHeaders });

  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!expectedSecret || req.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  try {
    const update = await req.json();
    const adminId = Deno.env.get("TELEGRAM_ADMIN_ID") || "1512444619";
    const message = update.message;
    const callback = update.callback_query;
    const fromId = String(message?.from?.id ?? callback?.from?.id ?? "");
    const chatType = message?.chat?.type ?? callback?.message?.chat?.type;
    const chatIdForAuth = String(message?.chat?.id ?? callback?.message?.chat?.id ?? "");
    if (fromId !== adminId || chatType !== "private" || chatIdForAuth !== adminId) {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (callback?.id) {
      await telegram("answerCallbackQuery", { callback_query_id: callback.id });
      const chatId = callback.message?.chat?.id;
      if (chatId) {
        if (callback.data === "dashboard") await dashboard(chatId);
        else if (callback.data === "players") await latestPlayers(chatId);
        else if (callback.data === "withdrawals") await withdrawalRequests(chatId);
        else if (callback.data === "search_help") await sendMenu(chatId, "Cari pemain: <code>/search username</code> atau <code>/search telegram_id</code>");
        else await sendMenu(chatId);
      }
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    const chatId = message?.chat?.id;
    const text = String(message?.text ?? "").trim();
    if (!chatId || !text) return new Response("ok", { status: 200, headers: corsHeaders });

    const parts = text.split(/\s+/);
    const command = parts[0].split("@")[0].toLowerCase();
    if (command === "/start" || command === "/menu") await sendMenu(chatId);
    else if (command === "/dashboard") await dashboard(chatId);
    else if (command === "/players") await latestPlayers(chatId);
    else if (command === "/withdrawals") await withdrawalRequests(chatId);
    else if (command === "/search") await searchPlayer(chatId, text.replace(/^\/search\s*/i, ""));
    else if (command === "/approve") await approveWithdrawal(chatId, parts[1] || "");
    else if (command === "/reject") await rejectWithdrawal(chatId, parts[1] || "", parts.slice(2).join(" "));
    else if (command === "/paid") await markWithdrawalPaid(chatId, parts[1] || "", parts[2] || "");
    else await sendMenu(chatId, "Perintah: /menu, /dashboard, /players, /withdrawals, /search nama, /approve ID, /reject ID alasan, /paid ID TX_HASH");
  } catch (error) {
    console.error("SevenRise admin bot error:", error);
  }
  return new Response("ok", { status: 200, headers: corsHeaders });
});
