export type UserRole = "admin" | "client";
export type AppointmentStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "overdue";
export type ReceiptStatus = "submitted" | "approved" | "rejected";
export type BillingType = "flat" | "hourly";
export type NotifyChannel = "whatsapp" | "email" | "sms";

export interface AppUser {
  id: string;
  role: UserRole;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface Region {
  id: string;
  name: string;
  weekday: number | null; // 0 = Sunday
  calendar_tag: string | null;
  color: string;
  is_active: boolean;
}

export interface Client {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  region_id: string | null;
  billing_type: BillingType;
  rate: number;
  payment_terms_days: number;
  preferred_channel: NotifyChannel;
  reminders_enabled: boolean;
}

export interface Appointment {
  id: string;
  client_id: string | null;
  region_id: string | null;
  google_event_id: string | null;
  title: string;
  location: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: AppointmentStatus;
  check_in_at: string | null;
  check_out_at: string | null;
  duration_minutes: number | null;
  reminder_sent_at: string | null;
  notes: string | null;
}

export interface Payment {
  id: string;
  appointment_id: string | null;
  client_id: string;
  amount: number;
  status: PaymentStatus;
  due_date: string;
  paid_at: string | null;
  method: string | null;
  manual_override: boolean;
  override_note: string | null;
  last_reminder_at: string | null;
  created_at: string;
}

export interface Receipt {
  id: string;
  payment_id: string;
  client_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  status: ReceiptStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** Row of the v_job_ledger view. */
export interface LedgerRow {
  appointment_id: string;
  client_id: string | null;
  client_name: string | null;
  region_id: string | null;
  region_name: string | null;
  scheduled_start: string;
  check_in_at: string | null;
  check_out_at: string | null;
  duration_minutes: number | null;
  payment_id: string | null;
  amount: number | null;
  payment_status: PaymentStatus | null;
  due_date: string | null;
  paid_at: string | null;
}

export type AppointmentWithClient = Appointment & {
  client: Pick<Client, "id" | "full_name" | "phone" | "address" | "preferred_channel"> | null;
};
