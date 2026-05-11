-- Accurate Edges — schema for Supabase
-- Run this in the Supabase SQL editor. It is idempotent.

-- =========================================================
-- Extensions
-- =========================================================
create extension if not exists "pgcrypto";

-- =========================================================
-- profiles (extends auth.users)
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'employee' check (role in ('boss', 'employee')),
  theme_preference text default null check (theme_preference in ('classic', 'modern') or theme_preference is null),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'employee')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- accounts
-- =========================================================
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  notes text,
  payment_terms text,
  created_at timestamptz not null default now()
);

-- services (line items per account)
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  service_name text not null,
  price_per_unit numeric(10,2) not null default 0
);
create index if not exists idx_services_account on public.services(account_id);

-- routes
create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  route_date date not null default current_date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_routes_employee_date on public.routes(employee_id, route_date);

-- route_accounts (the stops on a route)
create table if not exists public.route_accounts (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  order_index integer not null default 0
);
create index if not exists idx_route_accounts_route on public.route_accounts(route_id);

-- submissions
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  route_account_id uuid not null references public.route_accounts(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'flagged')),
  total_amount numeric(10,2) not null default 0,
  notes text
);
create index if not exists idx_submissions_status on public.submissions(status);
create index if not exists idx_submissions_employee on public.submissions(employee_id);

-- submission_items
create table if not exists public.submission_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  service_name text not null,
  quantity integer not null default 0,
  unit_price numeric(10,2) not null default 0,
  line_total numeric(10,2) not null default 0
);
create index if not exists idx_submission_items_submission on public.submission_items(submission_id);

-- invoices (photos used for OCR; auto-deleted after 90 days)
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  storage_path text,
  extracted_json jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_invoices_created on public.invoices(created_at);

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.services enable row level security;
alter table public.routes enable row level security;
alter table public.route_accounts enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_items enable row level security;
alter table public.invoices enable row level security;

-- Helper: is the current user a boss?
create or replace function public.is_boss()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'boss'
  );
$$;

-- profiles policies
drop policy if exists profiles_select_self_or_boss on public.profiles;
create policy profiles_select_self_or_boss on public.profiles
  for select using (auth.uid() = id or public.is_boss());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_boss_manage on public.profiles;
create policy profiles_boss_manage on public.profiles
  for all using (public.is_boss()) with check (public.is_boss());

-- accounts: boss can do anything; employees can read accounts that appear on a route assigned to them
drop policy if exists accounts_boss_all on public.accounts;
create policy accounts_boss_all on public.accounts
  for all using (public.is_boss()) with check (public.is_boss());

drop policy if exists accounts_employee_read on public.accounts;
create policy accounts_employee_read on public.accounts
  for select using (
    exists (
      select 1
      from public.route_accounts ra
      join public.routes r on r.id = ra.route_id
      where ra.account_id = public.accounts.id
        and r.employee_id = auth.uid()
    )
  );

-- services follow account access
drop policy if exists services_boss_all on public.services;
create policy services_boss_all on public.services
  for all using (public.is_boss()) with check (public.is_boss());

drop policy if exists services_employee_read on public.services;
create policy services_employee_read on public.services
  for select using (
    exists (
      select 1
      from public.route_accounts ra
      join public.routes r on r.id = ra.route_id
      where ra.account_id = public.services.account_id
        and r.employee_id = auth.uid()
    )
  );

-- routes
drop policy if exists routes_boss_all on public.routes;
create policy routes_boss_all on public.routes
  for all using (public.is_boss()) with check (public.is_boss());

drop policy if exists routes_employee_read on public.routes;
create policy routes_employee_read on public.routes
  for select using (employee_id = auth.uid());

-- route_accounts
drop policy if exists route_accounts_boss_all on public.route_accounts;
create policy route_accounts_boss_all on public.route_accounts
  for all using (public.is_boss()) with check (public.is_boss());

drop policy if exists route_accounts_employee_read on public.route_accounts;
create policy route_accounts_employee_read on public.route_accounts
  for select using (
    exists (select 1 from public.routes r where r.id = route_id and r.employee_id = auth.uid())
  );

-- submissions
drop policy if exists submissions_boss_all on public.submissions;
create policy submissions_boss_all on public.submissions
  for all using (public.is_boss()) with check (public.is_boss());

drop policy if exists submissions_employee_select on public.submissions;
create policy submissions_employee_select on public.submissions
  for select using (employee_id = auth.uid());

drop policy if exists submissions_employee_insert on public.submissions;
create policy submissions_employee_insert on public.submissions
  for insert with check (
    employee_id = auth.uid()
    and exists (
      select 1
      from public.route_accounts ra
      join public.routes r on r.id = ra.route_id
      where ra.id = route_account_id and r.employee_id = auth.uid()
    )
  );

-- submission_items
drop policy if exists submission_items_boss_all on public.submission_items;
create policy submission_items_boss_all on public.submission_items
  for all using (public.is_boss()) with check (public.is_boss());

drop policy if exists submission_items_employee_select on public.submission_items;
create policy submission_items_employee_select on public.submission_items
  for select using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id and s.employee_id = auth.uid()
    )
  );

drop policy if exists submission_items_employee_insert on public.submission_items;
create policy submission_items_employee_insert on public.submission_items
  for insert with check (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id and s.employee_id = auth.uid() and s.status = 'pending'
    )
  );

-- invoices: boss-only
drop policy if exists invoices_boss_all on public.invoices;
create policy invoices_boss_all on public.invoices
  for all using (public.is_boss()) with check (public.is_boss());

-- =========================================================
-- Retention: invoices auto-delete after 90 days.
-- Run from a scheduled task (Supabase pg_cron) or call manually:
--   select public.prune_old_invoices();
-- =========================================================
create or replace function public.prune_old_invoices()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.invoices where created_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Optional: pg_cron schedule (uncomment if pg_cron is enabled)
-- select cron.schedule('prune-invoices-daily', '0 3 * * *', $$select public.prune_old_invoices();$$);
