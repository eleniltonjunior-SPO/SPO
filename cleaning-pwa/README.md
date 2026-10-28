# Cleaning PWA

Mobile-first PWA for a residential cleaning business: route-based schedule synced from Google Calendar,
one-tap time tracking, receivables with receipt approval, earnings reports, and automated reminders.

**Stack:** Next.js 15 (App Router) · Tailwind CSS v4 · Lucide · Supabase (Postgres, Auth, Storage, Realtime).

## Structure

```
supabase/migrations/0001_init.sql   Schema, RLS, RPCs (check_in/check_out/review_receipt/mark_payment_paid), storage, realtime
supabase/seed.sql                   Sample regions (Mon–Fri routes) + a client
lib/
  time.ts            Duration math, business-timezone day bounds, formatting
  regions.ts         Region resolution (#tag → weekday route), filtering, grouping
  finance.ts         Pure report calculator (weekly/monthly revenue, hours vs income, outstanding)
  google-calendar.ts OAuth refresh, event listing, client/region matching, idempotent sync, write-back
  notifications/     templates, channels (Resend, Twilio, WhatsApp Cloud API / wa.me fallback), dispatch + log
  auth.ts            requireRole (pages), guardApi (route handlers), cron auth
app/
  admin/             Route (day + region), Payments (receipt queue + A/R), Reports, Settings
  portal/            Live attendance, billing + receipt upload, upcoming schedule
  api/
    appointments/[id]/timer   POST {action: check_in|check_out|undo}
    receipts                  POST register uploaded receipt → alert admin
    receipts/[id]/review      POST {approve, note} → settles payment, notifies client
    payments/[id]/mark-paid   POST manual override
    payments/[id]/remind      POST overdue reminder now
    calendar/sync             POST manual sync (admin)
    cron/calendar-sync        GET every 30 min (CRON_SECRET)
    cron/reminders            GET hourly: mark overdue, 24h reminders, overdue reminders
```

## Data flow

1. **Calendar → appointments.** `syncCalendar` upserts on `google_event_id`, writing only calendar-owned
   columns, so check-in/out data is never overwritten. Region = `#tag` in title/description, else the
   region whose `weekday` matches. Client = `extendedProperties.private.clientId` → attendee email → name in title.
2. **Check-in / check-out** are atomic RPCs. `duration_minutes` is a generated column.
3. **Completion → receivable.** A trigger creates the `payments` row (flat rate, or hourly × tracked time),
   due in `payment_terms_days`.
4. **Receipt upload.** Browser uploads straight to the private `receipts` bucket under `<client_id>/<payment_id>/`
   (storage RLS), then `POST /api/receipts` registers it (table RLS checks ownership + unpaid) and alerts the owner.
   Approval via `review_receipt` marks the payment paid.
5. **Realtime.** The client portal subscribes to its own `appointments` rows and updates arrival/departure live.

## Setup

1. Create a Supabase project. Run `supabase/migrations/0001_init.sql`, then optionally `supabase/seed.sql`.
2. Auth → enable Email (magic link). Add `<APP_URL>/auth/callback` to redirect URLs.
3. Sign in once with the owner email, then:
   `update public.users set role = 'admin' where email = 'owner@yourdomain.com';`
4. Create client rows with their email — they are linked automatically on first login.
5. Google Cloud: enable Calendar API, create an OAuth client, obtain a refresh token with scope
   `https://www.googleapis.com/auth/calendar.events` (e.g. OAuth Playground with your own client).
6. `cp .env.example .env.local`, fill in values, then:

```bash
npm install
npm run dev
npm test        # pure logic: finance, regions, time
```

### Notifications

| Channel  | Requires                                   | Without credentials                         |
|----------|--------------------------------------------|---------------------------------------------|
| Email    | `RESEND_API_KEY`, `RESEND_FROM`            | skipped                                     |
| SMS      | `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM`       | skipped                                     |
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | `wa.me` deep link, listed in Settings to tap |

Business-initiated WhatsApp Cloud API messages need Meta-approved templates; switch the payload in
`lib/notifications/channels.ts` to `type: "template"` once approved.

### Cron

`vercel.json` schedules both cron routes (sub-daily schedules need Vercel Pro). Elsewhere, call them with
`Authorization: Bearer $CRON_SECRET`. Alternatively schedule `mark_overdue_payments()` with `pg_cron`.
