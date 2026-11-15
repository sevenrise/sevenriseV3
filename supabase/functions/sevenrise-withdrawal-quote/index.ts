// SevenRise withdrawal quote endpoint.
// Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Deploy as Supabase Edge Function: sevenrise-withdrawal-quote.
// Returns a 5-minute TON/USD quote and stores it server-side for atomic request creation.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: "Server configuration is incomplete." }, 500);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd",
      { headers: { accept: "application/json" } },
    );
    if (!response.ok) throw new Error("Penyedia kurs TON sedang tidak tersedia. Coba lagi nanti.");
    const market = await response.json();
    const tonUsd = Number(market?.["the-open-network"]?.usd);
    if (!Number.isFinite(tonUsd) || tonUsd <= 0) throw new Error("Kurs TON tidak valid.");

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: quote, error: insertError } = await admin
      .from("svr_withdrawal_quotes")
      .insert({ ton_usd: tonUsd, source: "coingecko", expires_at: expiresAt.toISOString() })
      .select("id,ton_usd,created_at,expires_at")
      .single();
    if (insertError) throw new Error("Gagal menyimpan kuotasi. Pastikan migrasi database sudah diterapkan.");

    return json({
      quote_id: quote.id,
      ton_usd: Number(quote.ton_usd),
      points_per_ton_minimum: Math.ceil(3 * tonUsd * 100000),
      points_per_usdt: 100000,
      fee_usdt: 2,
      fee_wallet: "UQASEhxriyAwXA1jL5qwsMHmKGiL_ZiRPoGKhKsc7NpAjOUl",
      fee_jetton_master: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
      expires_at: quote.expires_at,
    }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 400);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
