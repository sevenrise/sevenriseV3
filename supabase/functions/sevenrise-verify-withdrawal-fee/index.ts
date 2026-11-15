// Verify a real incoming official USDt Jetton payment on TON Mainnet.
// Requires the user's authenticated wallet to be the sender, exact 2 USDt,
// the official Tether Jetton master, and the SevenRise fee wallet.
// No screenshot or user-supplied transaction hash is trusted.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Address } from "https://esm.sh/@ton/core@0.59.0";

const FEE_WALLET = "UQASEhxriyAwXA1jL5qwsMHmKGiL_ZiRPoGKhKsc7NpAjOUl";
const USDT_MASTER = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
const FEE_AMOUNT = 2_000_000n; // USDt on TON has 6 decimals.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function normalizedAddress(value: string): string {
  return Address.parse(value).toRawString().toLowerCase();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: "Konfigurasi server belum lengkap." }, 500);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Silakan login." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Sesi login tidak valid." }, 401);

    const body = await req.json().catch(() => ({}));
    const requestId = String(body?.request_id ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
      return json({ error: "ID permintaan tidak valid." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: requestRow, error: requestError } = await admin
      .from("svr_withdrawal_requests")
      .select("id,user_id,status,wallet_address,fee_wallet,fee_jetton_master,created_at,fee_tx_hash")
      .eq("id", requestId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (requestError) throw requestError;
    if (!requestRow) return json({ error: "Permintaan tidak ditemukan." }, 404);
    if (requestRow.status !== "pending_fee") {
      if (requestRow.status === "pending_admin" || requestRow.status === "approved" || requestRow.status === "paid") {
        return json({ success: true, status: requestRow.status, message: "Fee sudah diverifikasi sebelumnya." });
      }
      return json({ error: "Status permintaan tidak mengizinkan verifikasi fee." }, 409);
    }
    if (requestRow.fee_tx_hash) return json({ error: "Transaksi fee sudah tercatat." }, 409);
    if (normalizedAddress(requestRow.fee_wallet) !== normalizedAddress(FEE_WALLET) ||
        normalizedAddress(requestRow.fee_jetton_master) !== normalizedAddress(USDT_MASTER)) {
      return json({ error: "Konfigurasi wallet atau kontrak fee tidak cocok." }, 409);
    }

    const createdAt = Math.floor(new Date(requestRow.created_at).getTime() / 1000);
    if (!Number.isFinite(createdAt)) return json({ error: "Waktu permintaan tidak valid." }, 500);

    const params = new URLSearchParams({
      owner_address: FEE_WALLET,
      direction: "in",
      jetton_master: USDT_MASTER,
      start_utime: String(createdAt),
      limit: "100",
      sort: "desc",
    });
    const apiKey = Deno.env.get("TONCENTER_API_KEY");
    const chainResponse = await fetch(`https://toncenter.com/api/v3/jetton/transfers?${params.toString()}`, {
      headers: {
        accept: "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
    });
    if (!chainResponse.ok) {
      console.error("TON Center returned", chainResponse.status, await chainResponse.text());
      return json({ error: "Pemeriksaan blockchain sedang tidak tersedia. Coba lagi beberapa saat." }, 503);
    }

    const chainData = await chainResponse.json();
    const transfers = Array.isArray(chainData?.jetton_transfers) ? chainData.jetton_transfers : [];
    const expectedSender = normalizedAddress(requestRow.wallet_address);
    const expectedRecipient = normalizedAddress(FEE_WALLET);
    const expectedMaster = normalizedAddress(USDT_MASTER);

    const match = transfers.find((transfer: Record<string, unknown>) => {
      try {
        if (transfer.transaction_aborted !== false) return false;
        if (BigInt(String(transfer.amount ?? "0")) !== FEE_AMOUNT) return false;
        if (normalizedAddress(String(transfer.source ?? "")) !== expectedSender) return false;
        if (normalizedAddress(String(transfer.destination ?? "")) !== expectedRecipient) return false;
        if (normalizedAddress(String(transfer.jetton_master ?? "")) !== expectedMaster) return false;
        const transferTime = Number(transfer.transaction_now ?? 0);
        if (!Number.isFinite(transferTime) || transferTime < createdAt) return false;
        return /^[0-9a-f]{64}$/i.test(String(transfer.transaction_hash ?? ""));
      } catch {
        return false;
      }
    });

    if (!match) {
      return json({
        success: false,
        status: "pending_fee",
        message: "Pembayaran 2 USDT yang cocok belum ditemukan. Pastikan memakai wallet terhubung, USDT resmi TON, nominal tepat 2 USDT, dan alamat fee SevenRise. Tunggu indeks blockchain lalu coba lagi.",
      }, 200);
    }

    const txHash = String(match.transaction_hash).toLowerCase();
    const { data: duplicate, error: duplicateError } = await admin
      .from("svr_withdrawal_requests")
      .select("id")
      .eq("fee_tx_hash", txHash)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) return json({ error: "Transaksi ini sudah digunakan untuk permintaan lain." }, 409);

    const { data: updated, error: updateError } = await admin
      .from("svr_withdrawal_requests")
      .update({
        status: "pending_admin",
        fee_tx_hash: txHash,
        fee_sender_wallet: requestRow.wallet_address,
        fee_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("user_id", user.id)
      .eq("status", "pending_fee")
      .select("id,status,fee_tx_hash,fee_verified_at")
      .maybeSingle();

    if (updateError) {
      console.error("Fee verification update failed:", updateError);
      return json({ error: "Fee terdeteksi tetapi pencatatan status gagal. Hubungi admin dengan hash transaksi." }, 503);
    }
    if (!updated) return json({ error: "Status permintaan berubah. Muat ulang riwayat penarikan." }, 409);

    return json({
      success: true,
      status: updated.status,
      transaction_hash: updated.fee_tx_hash,
      message: "Pembayaran 2 USDT berhasil diverifikasi di TON Mainnet. Permintaan diteruskan ke Super Admin.",
    });
  } catch (error) {
    console.error("Withdrawal fee verification error:", error);
    return json({ error: error instanceof Error ? error.message : "Terjadi kesalahan server." }, 400);
  }
});
