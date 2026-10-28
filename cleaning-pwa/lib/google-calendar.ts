import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRegion } from "./regions";
import type { Client, Region } from "./types";

/**
 * Google Calendar sync (single-tenant: the business owner's calendar).
 *
 * Auth: OAuth2 refresh token with scope
 *   https://www.googleapis.com/auth/calendar.events
 * obtained once via the OAuth Playground or a consent screen and stored in env.
 *
 * Event conventions (all optional, matched in this order):
 *   client  → extendedProperties.private.clientId
 *           → attendee email == clients.email
 *           → client full name contained in the event title
 *   region  → "#tag" in title/description == regions.calendar_tag
 *           → regions.weekday of the event's start day (fixed daily routes)
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

export interface GoogleEvent {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string }[];
  extendedProperties?: { private?: Record<string, string> };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function gcal<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google Calendar ${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

const calendarId = () => encodeURIComponent(process.env.GOOGLE_CALENDAR_ID ?? "primary");

/** All events in a window, recurring events expanded, cancelled included. */
export async function listEvents(timeMin: Date, timeMax: Date): Promise<GoogleEvent[]> {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      showDeleted: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await gcal<{ items: GoogleEvent[]; nextPageToken?: string }>(
      `/calendars/${calendarId()}/events?${params}`,
    );
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return events;
}

type ClientLite = Pick<Client, "id" | "full_name" | "email">;

export function matchClient(event: GoogleEvent, clients: ClientLite[]): ClientLite | null {
  const explicit = event.extendedProperties?.private?.clientId;
  if (explicit) {
    const c = clients.find((x) => x.id === explicit);
    if (c) return c;
  }

  const emails = new Set((event.attendees ?? []).map((a) => a.email?.toLowerCase()).filter(Boolean));
  const byEmail = clients.find((c) => c.email && emails.has(c.email.toLowerCase()));
  if (byEmail) return byEmail;

  const title = (event.summary ?? "").toLowerCase();
  // Longest name first so "Ann Smith-Lee" beats "Ann Smith".
  return [...clients].sort((a, b) => b.full_name.length - a.full_name.length).find((c) => title.includes(c.full_name.toLowerCase())) ?? null;
}

export interface SyncResult {
  fetched: number;
  upserted: number;
  cancelled: number;
  skippedAllDay: number;
  unmatchedClients: string[];
}

/**
 * Pull events into `appointments`. Idempotent (upsert on google_event_id).
 * Only calendar-owned columns are written, so check-in/out data and status
 * of tracked jobs are never overwritten. Uses the service-role client.
 */
export async function syncCalendar(
  db: SupabaseClient,
  { daysBack = 7, daysAhead = 60 }: { daysBack?: number; daysAhead?: number } = {},
): Promise<SyncResult> {
  const now = Date.now();
  const events = await listEvents(new Date(now - daysBack * 86_400_000), new Date(now + daysAhead * 86_400_000));

  const [{ data: regions, error: rErr }, { data: clients, error: cErr }] = await Promise.all([
    db.from("regions").select("*"),
    db.from("clients").select("id, full_name, email, region_id"),
  ]);
  if (rErr) throw rErr;
  if (cErr) throw cErr;

  const ids = events.map((e) => e.id);
  const { data: existing } = await db
    .from("appointments")
    .select("google_event_id, client_id, region_id")
    .in("google_event_id", ids.length ? ids : ["-"]);
  const existingById = new Map((existing ?? []).map((e) => [e.google_event_id as string, e]));

  const result: SyncResult = { fetched: events.length, upserted: 0, cancelled: 0, skippedAllDay: 0, unmatchedClients: [] };
  const rows: Record<string, unknown>[] = [];
  const cancelledIds: string[] = [];
  const syncedAt = new Date().toISOString();

  for (const ev of events) {
    if (ev.status === "cancelled") {
      cancelledIds.push(ev.id);
      continue;
    }
    const start = ev.start?.dateTime;
    const end = ev.end?.dateTime;
    if (!start || !end) {
      result.skippedAllDay++;
      continue;
    }

    const title = ev.summary?.trim() || "Cleaning";
    const prev = existingById.get(ev.id);
    const client = matchClient(ev, (clients ?? []) as ClientLite[]);
    const clientRegionId = (clients ?? []).find((c) => c.id === client?.id)?.region_id ?? null;
    const region = resolveRegion({ title, description: ev.description, start }, (regions ?? []) as Region[]);

    if (!client && !prev?.client_id) result.unmatchedClients.push(title);

    rows.push({
      google_event_id: ev.id,
      title,
      location: ev.location ?? null,
      scheduled_start: start,
      scheduled_end: end,
      // Manual assignments made in the app survive re-syncs.
      client_id: client?.id ?? prev?.client_id ?? null,
      region_id: region?.id ?? clientRegionId ?? prev?.region_id ?? null,
      synced_at: syncedAt,
    });
  }

  if (rows.length) {
    const { error, count } = await db
      .from("appointments")
      .upsert(rows, { onConflict: "google_event_id", count: "exact" });
    if (error) throw error;
    result.upserted = count ?? rows.length;
  }

  if (cancelledIds.length) {
    const { error, count } = await db
      .from("appointments")
      .update({ status: "cancelled" }, { count: "exact" })
      .in("google_event_id", cancelledIds)
      .eq("status", "scheduled");
    if (error) throw error;
    result.cancelled = count ?? 0;
  }

  await db.from("app_settings").upsert({ key: "calendar_sync", value: { last_synced_at: syncedAt, ...result } });
  return result;
}

/**
 * Write tracked times back to the calendar event (best effort).
 * colorId "2" = sage (completed), "5" = banana (in progress).
 */
export async function annotateEvent(
  eventId: string,
  info: { checkIn?: string | null; checkOut?: string | null; duration?: string },
): Promise<void> {
  if (!process.env.GOOGLE_REFRESH_TOKEN) return;
  const lines = [
    info.checkIn && `✅ Arrived: ${info.checkIn}`,
    info.checkOut && `🏁 Left: ${info.checkOut}`,
    info.duration && `⏱ Duration: ${info.duration}`,
  ].filter(Boolean);

  const current = await gcal<GoogleEvent>(`/calendars/${calendarId()}/events/${encodeURIComponent(eventId)}`);
  const base = (current.description ?? "").split("\n— Time log —")[0].trimEnd();
  await gcal(`/calendars/${calendarId()}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      description: `${base}\n— Time log —\n${lines.join("\n")}`,
      colorId: info.checkOut ? "2" : "5",
    }),
  });
}
