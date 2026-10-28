-- =============================================================================
-- Cleaning PWA — core schema
-- Tables: users, regions, clients, appointments, payments, receipts,
--         notification_log, app_settings
-- Includes: enums, RLS, check-in/out RPCs, payment automation, storage bucket,
--           realtime publication, reporting view.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.user_role          as enum ('admin', 'client');
create type public.appointment_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');
create type public.payment_status     as enum ('pending', 'paid', 'overdue');
create type public.receipt_status     as enum ('submitted', 'approved', 'rejected');
create type public.billing_type       as enum ('flat', 'hourly');
create type public.notify_channel     as enum ('whatsapp', 'email', 'sms');

-- -----------------------------------------------------------------------------
-- Shared trigger: updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- users (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null default 'client',
  full_name   text,
  email       text unique,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_users_updated before update on public.users
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- regions (fixed daily routes: Monday = Region A, ...)
-- -----------------------------------------------------------------------------
create table public.regions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  weekday       smallint check (weekday between 0 and 6),   -- 0 = Sunday … 6 = Saturday
  calendar_tag  text unique,                                -- e.g. '#north' found in event title/description
  color         text not null default '#0d9488',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index regions_one_active_per_weekday
  on public.regions (weekday) where is_active and weekday is not null;

-- -----------------------------------------------------------------------------
-- clients
-- -----------------------------------------------------------------------------
create table public.clients (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid unique references public.users (id) on delete set null,  -- portal login
  full_name           text not null,
  email               text,
  phone               text,                       -- E.164, e.g. +15551234567
  address             text,
  region_id           uuid references public.regions (id) on delete set null,
  billing_type        public.billing_type not null default 'flat',
  rate                numeric(10,2) not null default 0 check (rate >= 0),  -- per visit (flat) or per hour
  payment_terms_days  int not null default 3 check (payment_terms_days >= 0),
  preferred_channel   public.notify_channel not null default 'whatsapp',
  reminders_enabled   boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index clients_email_uniq on public.clients (lower(email)) where email is not null;
create index clients_region_idx on public.clients (region_id);
create trigger trg_clients_updated before update on public.clients
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- appointments (synced from Google Calendar; time tracking lives here)
-- -----------------------------------------------------------------------------
create table public.appointments (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid references public.clients (id) on delete set null,  -- null = unmatched calendar event
  region_id         uuid references public.regions (id) on delete set null,
  google_event_id   text unique,
  title             text not null,
  location          text,
  scheduled_start   timestamptz not null,
  scheduled_end     timestamptz not null,
  status            public.appointment_status not null default 'scheduled',
  check_in_at       timestamptz,
  check_out_at      timestamptz,
  duration_minutes  int generated always as (
                      case when check_in_at is not null and check_out_at is not null
                        then floor(extract(epoch from (check_out_at - check_in_at)) / 60)::int
                      end
                    ) stored,
  reminder_sent_at  timestamptz,
  notes             text,
  synced_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint appt_schedule_valid check (scheduled_end >= scheduled_start),
  constraint appt_checkout_after_checkin
    check (check_out_at is null or (check_in_at is not null and check_out_at >= check_in_at))
);
create index appt_start_idx         on public.appointments (scheduled_start);
create index appt_region_start_idx  on public.appointments (region_id, scheduled_start);
create index appt_client_start_idx  on public.appointments (client_id, scheduled_start);
create trigger trg_appt_updated before update on public.appointments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- payments (one per completed appointment)
-- -----------------------------------------------------------------------------
create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  appointment_id    uuid unique references public.appointments (id) on delete cascade,
  client_id         uuid not null references public.clients (id) on delete cascade,
  amount            numeric(10,2) not null check (amount >= 0),
  status            public.payment_status not null default 'pending',
  due_date          date not null,
  paid_at           timestamptz,
  method            text,                     -- zelle, cash, venmo, receipt, ...
  manual_override   boolean not null default false,
  override_note     text,
  marked_paid_by    uuid references public.users (id) on delete set null,
  last_reminder_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint paid_has_timestamp check (status <> 'paid' or paid_at is not null)
);
create index payments_client_status_idx on public.payments (client_id, status);
create index payments_status_due_idx    on public.payments (status, due_date);
create trigger trg_payments_updated before update on public.payments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- receipts (client-uploaded payment proofs, stored in bucket "receipts")
-- -----------------------------------------------------------------------------
create table public.receipts (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.payments (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  storage_path  text not null unique,         -- "<client_id>/<payment_id>/<uuid>.<ext>"
  file_name     text not null,
  mime_type     text not null check (mime_type in
                  ('image/jpeg','image/png','image/webp','image/heic','application/pdf')),
  size_bytes    int  not null check (size_bytes > 0 and size_bytes <= 10485760),
  status        public.receipt_status not null default 'submitted',
  reviewed_by   uuid references public.users (id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz not null default now()
);
create index receipts_status_idx  on public.receipts (status, created_at desc);
create index receipts_payment_idx on public.receipts (payment_id);

-- -----------------------------------------------------------------------------
-- notification_log (audit of every reminder / alert)
-- -----------------------------------------------------------------------------
create table public.notification_log (
  id              uuid primary key default gen_random_uuid(),
  channel         public.notify_channel not null,
  recipient       text not null,
  template        text not null,
  body            text not null,
  status          text not null check (status in ('sent', 'failed', 'link_generated')),
  error           text,
  client_id       uuid references public.clients (id) on delete set null,
  appointment_id  uuid references public.appointments (id) on delete set null,
  payment_id      uuid references public.payments (id) on delete set null,
  receipt_id      uuid references public.receipts (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index notification_log_created_idx on public.notification_log (created_at desc);

-- -----------------------------------------------------------------------------
-- app_settings (key/value: calendar sync state, notification toggles, ...)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
insert into public.app_settings (key, value) values
  ('notifications', '{"reminder_24h": true, "overdue_reminders": true, "overdue_reminder_every_days": 3, "receipt_alerts": true}'),
  ('calendar_sync', '{"last_synced_at": null}')
on conflict (key) do nothing;

-- =============================================================================
-- Auth helpers
-- =============================================================================
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_client_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.clients where user_id = auth.uid() limit 1;
$$;

-- New auth user → public.users row, auto-link to an existing client by email.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name, phone)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', new.phone)
  on conflict (id) do nothing;

  update public.clients
     set user_id = new.id
   where user_id is null
     and email is not null
     and lower(email) = lower(new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Time tracking RPCs (atomic, admin only)
-- =============================================================================
create or replace function public.check_in(p_appointment_id uuid)
returns public.appointments language plpgsql security definer set search_path = public as $$
declare r public.appointments;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.appointments
     set check_in_at = now(), status = 'in_progress'
   where id = p_appointment_id
     and status = 'scheduled'
     and check_in_at is null
  returning * into r;

  if not found then
    raise exception 'Appointment not found or already checked in' using errcode = 'P0001';
  end if;
  return r;
end $$;

create or replace function public.check_out(p_appointment_id uuid)
returns public.appointments language plpgsql security definer set search_path = public as $$
declare r public.appointments;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.appointments
     set check_out_at = now(), status = 'completed'
   where id = p_appointment_id
     and status = 'in_progress'
     and check_in_at is not null
     and check_out_at is null
  returning * into r;

  if not found then
    raise exception 'Appointment is not in progress' using errcode = 'P0001';
  end if;
  return r;
end $$;

-- Undo an accidental check-in (only while in progress).
create or replace function public.undo_check_in(p_appointment_id uuid)
returns public.appointments language plpgsql security definer set search_path = public as $$
declare r public.appointments;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.appointments
     set check_in_at = null, status = 'scheduled'
   where id = p_appointment_id and status = 'in_progress'
  returning * into r;

  if not found then
    raise exception 'Appointment is not in progress' using errcode = 'P0001';
  end if;
  return r;
end $$;

-- Completed appointment → receivable (flat rate or hourly × tracked time).
create or replace function public.create_payment_on_completion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c        public.clients;
  v_amount numeric(10,2);
begin
  if new.status = 'completed'
     and old.status is distinct from 'completed'
     and new.client_id is not null then

    select * into c from public.clients where id = new.client_id;

    v_amount := case c.billing_type
                  when 'hourly' then round(c.rate * coalesce(new.duration_minutes, 0) / 60.0, 2)
                  else c.rate
                end;

    insert into public.payments (appointment_id, client_id, amount, due_date)
    values (new.id, new.client_id, v_amount, current_date + c.payment_terms_days)
    on conflict (appointment_id) do nothing;
  end if;
  return new;
end $$;

create trigger trg_appt_completed
  after update of status on public.appointments
  for each row execute function public.create_payment_on_completion();

-- =============================================================================
-- Payment RPCs
-- =============================================================================
create or replace function public.mark_overdue_payments()
returns int language sql security definer set search_path = public as $$
  with u as (
    update public.payments
       set status = 'overdue'
     where status = 'pending' and due_date < current_date
    returning 1
  )
  select count(*)::int from u;
$$;

-- Manual override: admin marks a payment as paid (cash, Zelle, etc.).
create or replace function public.mark_payment_paid(
  p_payment_id uuid, p_method text default 'manual', p_note text default null
) returns public.payments language plpgsql security definer set search_path = public as $$
declare r public.payments;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.payments
     set status = 'paid', paid_at = now(), method = p_method,
         manual_override = true, override_note = p_note, marked_paid_by = auth.uid()
   where id = p_payment_id and status <> 'paid'
  returning * into r;

  if not found then
    raise exception 'Payment not found or already paid' using errcode = 'P0001';
  end if;
  return r;
end $$;

-- Approve / reject a client receipt. Approval settles the payment.
create or replace function public.review_receipt(
  p_receipt_id uuid, p_approve boolean, p_note text default null
) returns public.receipts language plpgsql security definer set search_path = public as $$
declare r public.receipts;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.receipts
     set status      = case when p_approve then 'approved' else 'rejected' end::public.receipt_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = p_note
   where id = p_receipt_id and status = 'submitted'
  returning * into r;

  if not found then
    raise exception 'Receipt not found or already reviewed' using errcode = 'P0001';
  end if;

  if p_approve then
    update public.payments
       set status = 'paid', paid_at = now(), method = coalesce(method, 'receipt'),
           marked_paid_by = auth.uid()
     where id = r.payment_id and status <> 'paid';
  end if;
  return r;
end $$;

-- =============================================================================
-- Reporting view (RLS of underlying tables applies via security_invoker)
-- =============================================================================
create or replace view public.v_job_ledger with (security_invoker = true) as
select
  a.id               as appointment_id,
  a.client_id,
  c.full_name        as client_name,
  a.region_id,
  r.name             as region_name,
  a.scheduled_start,
  a.check_in_at,
  a.check_out_at,
  a.duration_minutes,
  p.id               as payment_id,
  p.amount,
  p.status           as payment_status,
  p.due_date,
  p.paid_at
from public.appointments a
left join public.clients  c on c.id = a.client_id
left join public.regions  r on r.id = a.region_id
left join public.payments p on p.appointment_id = a.id
where a.status = 'completed';

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.users            enable row level security;
alter table public.regions          enable row level security;
alter table public.clients          enable row level security;
alter table public.appointments     enable row level security;
alter table public.payments         enable row level security;
alter table public.receipts         enable row level security;
alter table public.notification_log enable row level security;
alter table public.app_settings     enable row level security;

-- users: read self; only admins write (prevents role self-escalation)
create policy users_select_self  on public.users for select using (id = auth.uid() or public.is_admin());
create policy users_admin_write  on public.users for all    using (public.is_admin()) with check (public.is_admin());

-- regions
create policy regions_read        on public.regions for select to authenticated using (true);
create policy regions_admin_write on public.regions for all using (public.is_admin()) with check (public.is_admin());

-- clients
create policy clients_admin_all   on public.clients for all    using (public.is_admin()) with check (public.is_admin());
create policy clients_select_self on public.clients for select using (user_id = auth.uid());

-- appointments
create policy appt_admin_all      on public.appointments for all    using (public.is_admin()) with check (public.is_admin());
create policy appt_select_own     on public.appointments for select using (client_id = public.my_client_id());

-- payments
create policy payments_admin_all  on public.payments for all    using (public.is_admin()) with check (public.is_admin());
create policy payments_select_own on public.payments for select using (client_id = public.my_client_id());

-- receipts
create policy receipts_admin_all  on public.receipts for all    using (public.is_admin()) with check (public.is_admin());
create policy receipts_select_own on public.receipts for select using (client_id = public.my_client_id());
create policy receipts_insert_own on public.receipts for insert with check (
  client_id = public.my_client_id()
  and status = 'submitted'
  and reviewed_by is null
  and split_part(storage_path, '/', 1) = public.my_client_id()::text
  and exists (
    select 1 from public.payments p
     where p.id = receipts.payment_id and p.client_id = public.my_client_id() and p.status <> 'paid'
  )
);

-- admin-only tables
create policy notif_admin_all    on public.notification_log for all using (public.is_admin()) with check (public.is_admin());
create policy settings_admin_all on public.app_settings     for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- Storage: private "receipts" bucket, path "<client_id>/<payment_id>/<file>"
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

create policy receipts_obj_client_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = public.my_client_id()::text);

create policy receipts_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts'
         and ((storage.foldername(name))[1] = public.my_client_id()::text or public.is_admin()));

create policy receipts_obj_admin_all on storage.objects for all to authenticated
  using (bucket_id = 'receipts' and public.is_admin())
  with check (bucket_id = 'receipts' and public.is_admin());

-- =============================================================================
-- Realtime (client portal live attendance, admin receipt queue)
-- =============================================================================
alter publication supabase_realtime add table public.appointments, public.payments, public.receipts;

-- =============================================================================
-- Optional: pg_cron (Supabase → Database → Extensions → pg_cron)
-- select cron.schedule('mark-overdue', '5 0 * * *', $$select public.mark_overdue_payments()$$);
-- =============================================================================

-- Bootstrap the owner account after first login:
-- update public.users set role = 'admin' where email = 'owner@yourdomain.com';
