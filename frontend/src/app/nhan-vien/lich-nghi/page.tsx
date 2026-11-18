"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Trash2 } from "lucide-react";
import { PageHead, StaffShell } from "@/components/staff-shell";
import { Alert, Button, Empty, Field, Input, Panel, Segmented } from "@/components/ui";
import { toast } from "@/components/toast";
import { api, errMsg } from "@/lib/api";
import { dayLabel, todayISO } from "@/lib/format";
import type { StaffBrief } from "@/lib/types";

type Session = "MORNING" | "AFTERNOON" | "FULL_DAY";
interface Leave { id: number; date: string; session: Session; session_label: string; reason: string | null }
interface Affected { appointment_id: number; code: string; slot: string; status: string; patient: string; phone: string; replacement: { id: number; full_name: string } | null }

export default function Page() {
  return <StaffShell roles={["DOCTOR", "TECHNICIAN", "PHARMACIST"]}>{(s) => <Leaves staff={s} />}</StaffShell>;
}

function Leaves({ staff }: { staff: StaffBrief }) {
  const [list, setList] = useState<Leave[] | null>(null);
  const [date, setDate] = useState("");
  const [session, setSession] = useState<Session>("FULL_DAY");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Affected[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isDoctor = staff.role === "DOCTOR";
  const load = useCallback(() => api<Leave[]>("/api/leaves/mine", { auth: "staff" }).then(setList).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);

  async function check() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ affected: Affected[] }>("/api/leaves/preview", { auth: "staff", body: { date, session } });
      setPreview(r.affected);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ affected: number }>("/api/leaves", { auth: "staff", body: { date, session, reason } });
      toast("Đã đăng ký nghỉ", { tone: "ok", body: r.affected ? `Đã gửi email cho ${r.affected} bệnh nhân để chọn bác sĩ thay thế, đổi giờ hoặc hoàn cọc` : undefined });
      setDate(""); setReason(""); setPreview(null);
      load();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const confirmed = preview?.filter((p) => p.status === "CONFIRMED") ?? [];
  return (
    <>
      <PageHead title="Lịch nghỉ" sub="Khung giờ trùng lịch nghỉ sẽ không hiển thị cho bệnh nhân đặt mới." />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Panel title="Đăng ký nghỉ">
          {err && <Alert tone="danger" className="mb-4">{err}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ngày nghỉ" required><Input type="date" min={todayISO()} value={date} onChange={(e) => { setDate(e.target.value); setPreview(null); }} /></Field>
            <Field label="Buổi" required>
              <Segmented value={session} onChange={(v) => { setSession(v); setPreview(null); }} size="lg" name="Buổi nghỉ"
                options={[{ value: "MORNING", label: "Sáng" }, { value: "AFTERNOON", label: "Chiều" }, { value: "FULL_DAY", label: "Cả ngày" }]} />
            </Field>
            <Field label="Lý do" className="sm:col-span-2"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Không bắt buộc" /></Field>
          </div>
          {isDoctor && !preview && (
            <div className="mt-4 flex justify-end"><Button disabled={!date} loading={busy} onClick={check}>Kiểm tra lịch hẹn bị ảnh hưởng</Button></div>
          )}
          {isDoctor && preview && (
            <div className="mt-5">
              {confirmed.length === 0 ? (
                <Alert tone="ok" title="Không có bệnh nhân nào bị ảnh hưởng" />
              ) : (
                <>
                  <Alert tone="warn" title={`${confirmed.length} bệnh nhân đã đặt lịch trong buổi này`}>
                    Sau khi lưu, hệ thống gửi email để bệnh nhân chọn: nhận bác sĩ thay thế, đổi giờ khác hoặc hoàn cọc.
                  </Alert>
                  <div className="mt-3 overflow-x-auto rounded-md border border-line">
                    <table className="w-full text-[14.5px]">
                      <thead><tr className="border-b border-line bg-paper text-left text-[12.5px] font-semibold text-ink-3"><th className="px-3 py-2">Giờ</th><th className="px-3 py-2">Bệnh nhân</th><th className="px-3 py-2">Bác sĩ thay thế đề xuất</th></tr></thead>
                      <tbody>
                        {confirmed.map((p) => (
                          <tr key={p.appointment_id} className="border-b border-line-2 last:border-0">
                            <td className="num px-3 py-2 font-bold">{p.slot}</td>
                            <td className="px-3 py-2">{p.patient} <span className="num text-ink-3">· {p.phone}</span></td>
                            <td className="px-3 py-2">{p.replacement ? p.replacement.full_name : <span className="text-warn">Không còn bác sĩ cùng khoa trống</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
          {(!isDoctor || preview) && (
            <div className="mt-4 flex justify-end gap-2">
              {preview && <Button variant="secondary" onClick={() => setPreview(null)}>Hủy</Button>}
              <Button disabled={!date} loading={busy} onClick={save}>
                {confirmed.length ? `Xác nhận nghỉ & báo cho ${confirmed.length} bệnh nhân` : "Lưu lịch nghỉ"}
              </Button>
            </div>
          )}
        </Panel>
        <Panel title="Lịch nghỉ sắp tới">
          {list === null ? null : list.length === 0 ? <Empty title="Chưa đăng ký nghỉ" icon={<CalendarOff className="size-7" />} /> : (
            <ul className="divide-y divide-line-2">
              {list.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div><p className="font-semibold">{dayLabel(l.date)}</p><p className="text-sm text-ink-3">Nghỉ {l.session_label}{l.reason ? ` · ${l.reason}` : ""}</p></div>
                  <button aria-label="Xóa lịch nghỉ" onClick={async () => { await api(`/api/leaves/${l.id}`, { method: "DELETE", auth: "staff" }).catch((e) => toast(errMsg(e), { tone: "danger" })); load(); }}
                    className="rounded p-1.5 text-ink-3 hover:bg-danger-tint hover:text-danger"><Trash2 className="size-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
