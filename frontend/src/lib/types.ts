export type Status =
  | "HOLD" | "CONFIRMED" | "CHECKED_IN" | "IN_CONSULTATION" | "WAITING_LAB"
  | "COMPLETED" | "PAID" | "EXPIRED" | "CANCELLED" | "NO_SHOW";
export type Urgency = "CAP_CUU" | "KHAM_SOM" | "BINH_THUONG";
export type LabStatus = "ORDERED" | "IN_PROGRESS" | "DONE" | "CANCELLED";

export interface StaffBrief {
  id: number; full_name: string; room: string | null; role: string;
  specialty: string | null; department: string | null;
}

export interface Patient {
  id: number; full_name: string; phone: string; birth_year: number; age: number; gender: string;
  email?: string | null; address?: string | null; relative_name?: string | null; relative_phone?: string | null;
}

export interface Config {
  clinic_name: string; hotline: string; address: string; deposit_amount: number; consultation_fee: number;
  hold_minutes: number; slot_capacity: number; payment_dev_mode: boolean;
  morning_slots: string[]; afternoon_slots: string[];
}

export interface Specialty { id: number; name: string; description: string | null; is_general: boolean }

export interface ChatMessage {
  role: "user" | "assistant"; text: string; kind: "text" | "question" | "result" | "emergency";
  options?: string[]; data?: TriageResultData & { field?: string }; ts: string; answer_for?: string | null;
}
export interface RedFlag { group: string; finding: string; suspect: string; specialty: string }
export interface Vitals { bp?: { systolic: number; diastolic: number }; temp?: number; spo2?: number }
export interface TriageResultData {
  chuyen_khoa: string; muc_do: Urgency; tom_tat: string; ly_do: string; specialty_id: number | null;
  red_flags: RedFlag[]; vitals: Vitals; disclaimer: string; nguon?: string;
}
export interface TriageSession {
  id: string; state: "ACTIVE" | "DONE" | "EMERGENCY"; messages: ChatMessage[]; vitals: Vitals; red_flags: RedFlag[];
  result: TriageResultData | null; urgency: Urgency | null; specialty_id: number | null;
  emergency_acknowledged: boolean; pending: { field: string } | null; provider: string | null;
  age_group: string | null; gender: string | null; disclaimer: string;
}

export interface SlotDoctor { id: number; name: string; room: string | null; left: number; day_load: number }
export interface DaySlots { date: string; slots: { slot: string; left: number; doctors: SlotDoctor[]; suggested_doctor_id: number }[] }
export interface Suggestion { date: string; slot: string; doctor: SlotDoctor; alternatives: SlotDoctor[] }

export interface LabOrderT {
  id: number; appointment_id: number; status: LabStatus; status_label: string;
  service: { id: number; name: string }; department: { id: number; name: string; room: string | null };
  price: number; doctor_note: string | null; cancel_reason: string | null; technician: StaffBrief | null;
  claimed_at: string | null; completed_at: string | null; created_at: string;
  result?: { files: { url: string; name: string; type: string }[]; note: string | null; is_locked: boolean; is_amended: boolean } | null;
}

export interface RecordT {
  id: number; clinical_notes: string | null; diagnosis: string | null; diagnosis_kb_id: number | null;
  advice: string | null; follow_up_date: string | null; is_locked: boolean; is_amended: boolean; locked_at: string | null;
}

export interface RxItemT {
  medicine_id: number; name: string; unit: string; dose_per_time: number; times_per_day: number; days: number;
  timing: string; timing_label: string; quantity: number; unit_price: number; amount: number; note: string | null;
}
export interface ScheduleRow { medicine: string; unit: string; dose: number; sessions: string[]; timing: string; days: number; note: string | null }
export interface PrescriptionT {
  id: number; total_amount: number; warnings: RxWarning[]; duplicate_ack: boolean; overdose_reason: string | null;
  is_locked: boolean; items: RxItemT[]; schedule: ScheduleRow[]; evaluation?: RxEvaluation;
}
export interface RxWarning { type: "DUPLICATE" | "OVERDOSE"; level: string; message: string; lines: number[]; ingredient?: string; total?: number; max?: number }
export interface RxEvaluation {
  lines: (RxItemT & { index: number; ingredients: { name: string; amount: number; unit: string }[] })[];
  total: number; warnings: RxWarning[]; requires_duplicate_ack: boolean; requires_overdose_reason: boolean;
}

export interface AuditT {
  id: number; entity_type: string; entity_id: string; action: string; from_status: string | null; to_status: string | null;
  from_label: string | null; to_label: string | null; actor_type: string; actor_name: string | null; reason: string | null;
  old_value: Record<string, unknown> | null; new_value: Record<string, unknown> | null; created_at: string;
}

export interface Appointment {
  id: number; code: string; date: string; slot: string; status: Status; status_label: string; urgency: Urgency | null;
  is_general: boolean; specialty: { id: number; name: string }; doctor: StaffBrief; hold_expires_at: string | null;
  deposit_amount: number; consultation_fee: number; checked_in_at: string | null; leave_conflict: boolean;
  suggested_doctor: StaffBrief | null; created_at: string;
}

export interface Visit extends Appointment {
  record: RecordT | null; lab_orders: LabOrderT[]; prescription: PrescriptionT | null; amendments: AuditT[];
}

export interface AppointmentDetail extends Appointment {
  patient: { full_name: string; phone: string };
  payment?: { amount: number; content: string; bank_name: string; account: string; account_name: string; vietqr: string; server_now: string };
  deposit_paid: number; refund_pending: boolean; can_cancel: boolean; refundable: boolean;
  queue: { number: number; status: string; call_count: number; ahead: number } | null;
  visit?: Visit;
}
