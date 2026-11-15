-- SevenRise V3 withdrawal foundation
-- Apply this migration in Supabase SQL Editor before enabling the Mini App withdrawal UI.

create table if not exists public.svr_withdrawal_quotes (
  id uuid primary key default gen_random_uuid(),
  ton_usd numeric(20,8) not null check (ton_usd > 0),
  source text not null default 'coingecko',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists svr_withdrawal_quotes_expiry_idx
  on public.svr_withdrawal_quotes (expires_at desc);

create table if not exists public.svr_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  points_amount bigint not null check (points_amount > 0),
  usdt_value numeric(20,8) not null check (usdt_value > 0),
  ton_usd numeric(20,8) not null check (ton_usd > 0),
  ton_amount numeric(20,8) not null check (ton_amount >= 3),
  wallet_address text not null,
  fee_usdt numeric(20,8) not null default 2.0 check (fee_usdt = 2.0),
  fee_wallet text not null default 'UQASEhxriyAwXA1jL5qwsMHmKGiL_ZiRPoGKhKsc7NpAjOUl',
  fee_jetton_master text not null default 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
  quote_id uuid not null references public.svr_withdrawal_quotes(id),
  status text not null default 'pending_fee'
    check (status in ('pending_fee','fee_verified','pending_admin','approved','rejected','paid','expired')),
  fee_tx_hash text,
  payout_tx_hash text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fee_verified_at timestamptz,
  paid_at timestamptz
);

create index if not exists svr_withdrawal_requests_user_idx
  on public.svr_withdrawal_requests (user_id, created_at desc);
create index if not exists svr_withdrawal_requests_status_idx
  on public.svr_withdrawal_requests (status, created_at);

alter table public.svr_withdrawal_quotes enable row level security;
alter table public.svr_withdrawal_requests enable row level security;

drop policy if exists "Users read own withdrawal requests" on public.svr_withdrawal_requests;
create policy "Users read own withdrawal requests"
  on public.svr_withdrawal_requests for select
  to authenticated using (auth.uid() = user_id);

revoke all on public.svr_withdrawal_quotes from anon, authenticated;
revoke all on public.svr_withdrawal_requests from anon, authenticated;
grant select on public.svr_withdrawal_requests to authenticated;

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

  select * into v_quote
  from public.svr_withdrawal_quotes
  where id = input_quote_id and expires_at > now()
  for share;

  if not found then
    raise exception 'Kuotasi sudah kedaluwarsa. Ambil kurs terbaru.';
  end if;

  select wallet_address, points
    into v_wallet, v_balance
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Profil pengguna tidak ditemukan.';
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

comment on table public.svr_withdrawal_requests is
  'Withdrawal requests. Points remain reserved while status is pending_fee, fee_verified, pending_admin, or approved. Payout requires manual admin processing until a secure treasury signer exists.';
