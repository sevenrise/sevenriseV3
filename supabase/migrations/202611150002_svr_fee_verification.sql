-- SevenRise production fee verification hardening.
-- The fee is verified against TON Center API v3, not screenshots or user-submitted hashes.

alter table public.svr_withdrawal_requests
  add column if not exists fee_sender_wallet text;

create unique index if not exists svr_withdrawal_fee_tx_hash_unique
  on public.svr_withdrawal_requests (fee_tx_hash)
  where fee_tx_hash is not null;

create or replace function public.svr_create_withdrawal_request(
  input_quote_id uuid,
  input_points_amount bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_quote public.svr_withdrawal_quotes%rowtype;
  v_wallet text;
  v_balance numeric;
  v_reserved numeric;
  v_usdt numeric(20,8);
  v_ton numeric(20,8);
  v_min_points bigint;
  v_request public.svr_withdrawal_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Silakan login terlebih dahulu.';
  end if;
  if input_points_amount is null or input_points_amount <= 0 then
    raise exception 'Jumlah SVR Points tidak valid.';
  end if;

  select wallet_address, points
    into v_wallet, v_balance
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Profil pengguna tidak ditemukan.';
  end if;

  if exists (
    select 1 from public.svr_withdrawal_requests
    where user_id = v_user_id
      and status in ('pending_fee','fee_verified','pending_admin','approved')
  ) then
    raise exception 'Selesaikan atau batalkan permintaan penarikan aktif sebelumnya terlebih dahulu.';
  end if;

  select * into v_quote
  from public.svr_withdrawal_quotes
  where id = input_quote_id and expires_at > now()
  for share;

  if not found then
    raise exception 'Kuotasi sudah kedaluwarsa. Ambil kurs terbaru.';
  end if;

  if v_wallet is null or length(trim(v_wallet)) < 20 then
    raise exception 'Hubungkan TON Wallet Mainnet terlebih dahulu.';
  end if;

  v_usdt := input_points_amount::numeric / 100000;
  v_ton := v_usdt / v_quote.ton_usd;
  v_min_points := ceil(3 * v_quote.ton_usd * 100000)::bigint;

  if input_points_amount < v_min_points or v_ton < 3 then
    raise exception 'Minimum penarikan adalah 3 TON sebelum biaya. Minimal saat ini % SVR Points.', v_min_points;
  end if;

  select coalesce(sum(points_amount),0) into v_reserved
  from public.svr_withdrawal_requests
  where user_id = v_user_id
    and status in ('pending_fee','fee_verified','pending_admin','approved');

  if v_balance is null or v_balance - v_reserved < input_points_amount then
    raise exception 'Saldo tersedia tidak cukup setelah memperhitungkan poin yang sedang dikunci.';
  end if;

  insert into public.svr_withdrawal_requests (
    user_id, points_amount, usdt_value, ton_usd, ton_amount,
    wallet_address, quote_id
  ) values (
    v_user_id, input_points_amount, v_usdt, v_quote.ton_usd, v_ton,
    v_wallet, v_quote.id
  ) returning * into v_request;

  return jsonb_build_object(
    'success', true,
    'request_id', v_request.id,
    'points_amount', v_request.points_amount,
    'usdt_value', v_request.usdt_value,
    'ton_amount', v_request.ton_amount,
    'fee_usdt', v_request.fee_usdt,
    'fee_wallet', v_request.fee_wallet,
    'fee_jetton_master', v_request.fee_jetton_master,
    'status', v_request.status,
    'quote_expires_at', v_quote.expires_at
  );
end;
$$;

revoke all on function public.svr_create_withdrawal_request(uuid,bigint) from public, anon;
grant execute on function public.svr_create_withdrawal_request(uuid,bigint) to authenticated;
