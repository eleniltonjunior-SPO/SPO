import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByRegion, regionForDay, resolveRegion } from "./regions.ts";
import { dayBoundsUtc, formatDuration } from "./time.ts";
import type { Appointment, Region } from "./types.ts";

const regions: Region[] = [
  { id: "a", name: "Region A", weekday: 1, calendar_tag: "#north", color: "#000", is_active: true },
  { id: "b", name: "Region B", weekday: 2, calendar_tag: "#downtown", color: "#000", is_active: true },
];

test("tag in event overrides weekday route", () => {
  // 2026-10-26 is a Monday (Region A) but the event is tagged #downtown
  const r = resolveRegion({ title: "Smith #Downtown", start: "2026-10-26T14:00:00Z" }, regions);
  assert.equal(r?.id, "b");
});

test("falls back to weekday of the event in business tz", () => {
  assert.equal(resolveRegion({ title: "Smith", start: "2026-10-26T14:00:00Z" }, regions)?.id, "a");
  assert.equal(regionForDay("2026-10-27", regions)?.id, "b");
  assert.equal(regionForDay("2026-10-28", regions), null);
});

test("groupByRegion keeps region order, unassigned last", () => {
  const base = { status: "scheduled", scheduled_start: "2026-10-26T14:00:00Z" } as Appointment;
  const groups = groupByRegion(
    [{ ...base, id: "1", region_id: null }, { ...base, id: "2", region_id: "b" }, { ...base, id: "3", region_id: "a" }],
    regions,
  );
  assert.deepEqual(groups.map((g) => g.region?.id ?? null), ["a", "b", null]);
});

test("time helpers", () => {
  assert.equal(formatDuration(135), "2h 15m");
  assert.equal(formatDuration(45), "45m");
  assert.deepEqual(dayBoundsUtc("2026-10-28", "America/New_York"), {
    start: "2026-10-28T04:00:00.000Z",
    end: "2026-10-29T04:00:00.000Z",
  });
});
