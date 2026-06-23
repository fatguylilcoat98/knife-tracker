-- Accurate Edges — schema for Supabase
-- Run this in the Supabase SQL editor. It is idempotent.

-- =========================================================
-- Extensions
-- =========================================================
create extension if not exists "pgcrypto";

-- =========================================================
-- profiles (extends auth.users)
-- =========================================================
-- Roles, lowest to highest privilege:
--   employee  field worker
--   boss      operational management (accounts, routes, approvals, payroll)
--   admin     everything a boss can do, plus managing everyone's roles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'employee' check (role in ('admin', 'boss', 'employee')),
  theme_preference text default null check (theme_preference in ('classic', 'modern') or theme_preference is null),
  created_at timestamptz not null default now()
);

-- Older databases may pre-date the email column; add it idempotently.
alter table public.profiles add column if not exists email text;

-- Widen the role check on databases created before the admin role existed.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'boss', 'employee'));

-- =========================================================
-- Role allowlists — addresses that get a role automatically on sign-up.
-- admin_emails wins over boss_emails. Add a row to grant a role without code
-- changes; the trigger reads these and there's a backfill at the end of file.
-- Managed via SQL (or an admin), never the public API — see RLS below.
-- =========================================================
create table if not exists public.boss_emails (
  email text primary key
);
create table if not exists public.admin_emails (
  email text primary key
);

-- Seed the initial owner as admin so their login can drive and verify the whole
-- app, including role management.
insert into public.admin_emails (email)
values ('stangman9898@gmail.com')
on conflict (email) do nothing;

-- Auto-create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  resolved_role text;
begin
  if exists (select 1 from public.admin_emails ae where lower(ae.email) = lower(new.email)) then
    resolved_role := 'admin';
  elsif exists (select 1 from public.boss_emails be where lower(be.email) = lower(new.email)) then
    resolved_role := 'boss';
  else
    resolved_role := 'employee';
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    resolved_role
  )
  on conflict (id) do update
    set email = excluded.email,
        -- Never downgrade an existing elevated role on re-auth.
        role = case
          when public.profiles.role in ('admin', 'boss') then public.profiles.role
          else excluded.role
        end;
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

-- commission_tiers (boss-configurable payroll schedule)
-- Each row says: once an employee's approved sales for the period reach
-- min_sales, they earn rate_percent on the whole period's sales. The highest
-- tier whose min_sales is met wins.
create table if not exists public.commission_tiers (
  id uuid primary key default gen_random_uuid(),
  min_sales numeric(12,2) not null default 0,
  rate_percent numeric(5,2) not null default 0
);

-- Seed a sensible default schedule only when the table is empty.
insert into public.commission_tiers (min_sales, rate_percent)
select * from (values
  (0::numeric, 20.00::numeric),
  (1000::numeric, 22.50::numeric),
  (2500::numeric, 25.00::numeric),
  (5000::numeric, 30.00::numeric)
) as seed(min_sales, rate_percent)
where not exists (select 1 from public.commission_tiers);

-- routes
create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  route_date date not null default current_date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_routes_employee_date on public.routes(employee_id, route_date);

-- One route per employee per day. Guards against duplicate routes created by
-- two devices/tabs racing in the route builder.
create unique index if not exists uq_routes_employee_date
  on public.routes(employee_id, route_date);

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

-- One submission per employee per stop. The app replaces (delete + re-insert)
-- when an employee edits a flagged stop, so this stays satisfied while blocking
-- accidental duplicates from offline replays or double taps.
create unique index if not exists uq_submissions_route_account_employee
  on public.submissions(route_account_id, employee_id);

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
alter table public.commission_tiers enable row level security;
alter table public.routes enable row level security;
alter table public.route_accounts enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_items enable row level security;
alter table public.invoices enable row level security;
alter table public.boss_emails enable row level security;
alter table public.admin_emails enable row level security;

-- Helper: does the current user hold management rights (boss OR admin)?
-- Admin is a superset of boss, so every boss-scoped policy applies to admins too.
create or replace function public.is_boss()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('boss', 'admin')
  );
$$;

-- Helper: is the current user an admin (top role)?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Role changes are admin-only, enforced server-side regardless of who calls the
-- API. Bosses can be granted operational management but cannot mint other
-- bosses/admins or alter an admin.
create or replace function public.enforce_profile_role_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- auth.uid() is null in trusted contexts (SQL editor, service role, the
  -- signup trigger). Only gate role changes that come from a logged-in API user.
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_role_change on public.profiles;
create trigger on_profile_role_change
  before update on public.profiles
  for each row execute procedure public.enforce_profile_role_change();

-- Allowlists: only admins may read or modify them via the API. The signup
-- trigger reads them through SECURITY DEFINER, so it is unaffected.
drop policy if exists boss_emails_admin_all on public.boss_emails;
create policy boss_emails_admin_all on public.boss_emails
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_emails_admin_all on public.admin_emails;
create policy admin_emails_admin_all on public.admin_emails
  for all using (public.is_admin()) with check (public.is_admin());

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

-- commission_tiers: boss manages the schedule; employees can read it so the
-- app can show them their own estimated earnings.
drop policy if exists commission_tiers_boss_all on public.commission_tiers;
create policy commission_tiers_boss_all on public.commission_tiers
  for all using (public.is_boss()) with check (public.is_boss());

drop policy if exists commission_tiers_read on public.commission_tiers;
create policy commission_tiers_read on public.commission_tiers
  for select using (auth.uid() is not null);

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

-- =========================================================
-- Storage: private bucket for invoice photos.
-- The app uploads the scanned photo here and records storage_path on the
-- invoices row. prune_old_invoices() removes the DB rows; pair it with a
-- storage lifecycle rule (or extend the prune function) to delete the objects.
-- =========================================================
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

drop policy if exists invoices_storage_boss_all on storage.objects;
create policy invoices_storage_boss_all on storage.objects
  for all
  using (bucket_id = 'invoices' and public.is_boss())
  with check (bucket_id = 'invoices' and public.is_boss());

-- =========================================================
-- Backfill: keep profile emails current and apply the role allowlists to any
-- accounts that signed up before this migration ran. Safe to run repeatedly.
-- admin_emails wins over boss_emails.
-- =========================================================
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and (p.email is distinct from u.email);

update public.profiles p
set role = 'admin'
from auth.users u
where u.id = p.id
  and p.role <> 'admin'
  and exists (
    select 1 from public.admin_emails ae where lower(ae.email) = lower(u.email)
  );

update public.profiles p
set role = 'boss'
from auth.users u
where u.id = p.id
  and p.role = 'employee'
  and exists (
    select 1 from public.boss_emails be where lower(be.email) = lower(u.email)
  );
