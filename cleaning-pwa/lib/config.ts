export const BUSINESS_TZ = process.env.NEXT_PUBLIC_BUSINESS_TZ ?? "America/New_York";
export const BUSINESS_NAME = process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "Home Cleaning";
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? "USD";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const RECEIPT_BUCKET = "receipts";
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;
