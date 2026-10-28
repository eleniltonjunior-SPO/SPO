import { NextResponse } from "next/server";

/** Map Postgres/PostgREST errors to HTTP. P0001 = business rule, 42501 = forbidden. */
export function dbError(error: { code?: string; message: string }) {
  const status = error.code === "42501" ? 403 : error.code === "P0001" ? 409 : 500;
  return NextResponse.json({ error: error.message }, { status });
}
