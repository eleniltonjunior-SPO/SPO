import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFinancialReport, bucketKey } from "./finance.ts";
import type { LedgerRow } from "./types.ts";

const row = (p: Partial<LedgerRow>): LedgerRow => ({
  appointment_id: crypto.randomUUID(),
  client_id: "c1",
  client_name: "Jane Doe",
  region_id: null,
  region_name: null,
  scheduled_start: "2026-10-05T14:00:00Z",
  check_in_at: "2026-10-05T14:00:00Z",
  check_out_at: "2026-10-05T17:00:00Z",
  duration_minutes: 180,
  payment_id: "p",
  amount: 150,
  payment_status: "paid",
  due_date: "2026-10-08",
  paid_at: "2026-10-06T00:00:00Z",
  ...p,
});

test("bucketKey: month and ISO week (Monday) in business tz", () => {
  assert.equal(bucketKey("2026-11-01T02:00:00Z", "month", "America/New_York"), "2026-10");
  assert.equal(bucketKey("2026-10-29T15:00:00Z", "week", "America/New_York"), "2026-10-26");
  // Sunday evening local still belongs to the week starting the previous Monday
  assert.equal(bucketKey("2026-11-02T03:00:00Z", "week", "America/New_York"), "2026-10-26");
});

test("monthly revenue, hours vs income, outstanding", () => {
  const r = buildFinancialReport(
    [
      row({ amount: 150, duration_minutes: 180 }),
      row({ amount: 100, duration_minutes: 120, payment_status: "pending", due_date: "2026-10-20" }),
      row({ client_id: "c2", client_name: "Bob", amount: 90, duration_minutes: 60, payment_status: "overdue", due_date: "2026-10-01" }),
      row({ scheduled_start: "2026-09-10T14:00:00Z", check_in_at: "2026-09-10T14:00:00Z", amount: 120, duration_minutes: 120 }),
    ],
    "month",
    "America/New_York",
  );

  assert.deepEqual(r.buckets.map((b) => b.key), ["2026-09", "2026-10"]);
  const oct = r.buckets[1];
  assert.equal(oct.jobs, 3);
  assert.equal(oct.billed, 340);
  assert.equal(oct.collected, 150);
  assert.equal(oct.minutes, 360);
  assert.equal(oct.effectiveHourly, 56.67);

  assert.equal(r.totals.billed, 460);
  assert.equal(r.outstanding.pending, 100);
  assert.equal(r.outstanding.overdue, 90);
  assert.equal(r.outstanding.total, 190);
  assert.equal(r.outstanding.byClient[0].clientName, "Bob"); // overdue first
});

test("jobs without tracked time don't divide by zero", () => {
  const r = buildFinancialReport([row({ duration_minutes: null, check_in_at: null })], "week");
  assert.equal(r.totals.effectiveHourly, 0);
});
