"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, FileText, Lock, Pencil, Upload, X } from "lucide-react";
import { StaffShell } from "@/components/staff-shell";
import { Alert, AmendedTag, Button, Dialog, Field, Forbidden, Input, KV, LabTag, Panel, Spinner, Textarea, cx } from "@/components/ui";
import { AmendHistory } from "@/components/visit-view";
import { toast } from "@/components/toast";
import { ApiError, api, errMsg } from "@/lib/api";
import { dateTime, genderLabel } from "@/lib/format";
import type { AuditT, LabOrderT, StaffBrief } from "@/lib/types";

type Detail = LabOrderT & { patient: { full_name: string; age: number; gender: string; birth_year: number }; appointment_code: string;
  ordered_by: StaffBrief; audit: AuditT[]; can_edit: boolean; can_amend: boolean };
type FileT = { url: string; name: string; type: string };

export default function Page() {
  return <StaffShell roles={["TECHNICIAN"]}>{() => <Suspense fallback={<Spinner />}><OrderView /></Suspense>}</StaffShell>;
}

function OrderView() {
  const { id } = useParams<{ id: string }>();
  const [o, setO] = useState<Detail | null>(null);
  const [err, setErr] = useState<{ status: number; msg: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [amendOpen, setAmendOpen] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Detail>(`/api/lab/orders/${id}`, { auth: "staff" });
      setO(d);
      setNote(d.result?.note ?? "");
    } catch (e) {
      setErr({ status: e instanceof ApiError ? e.status : 0, msg: errMsg(e) });
    }
  }, [id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() bất đồng bộ: setState chạy sau await
  useEffect(() => { load(); }, [load]);

  if (err) return err.status === 403
    ? <Forbidden message={err.msg} back={<Link href="/nhan-vien/cls" className="font-semibold text-brand underline">Về phiếu của phòng tôi</Link>} />
    : <Alert tone="danger">{err.msg}</Alert>;
  if (!o) return <Spinner />;

  async function upload(files: FileList | File[]) {
    if (!files.length) return;
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    setBusy("upload");
    try {
      await api(`/api/lab/orders/${id}/files`, { form, auth: "staff" });
      load();
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setBusy(null);
    }
  }
  async function removeFile(url: string) {
    await api(`/api/lab/orders/${id}/files/remove`, { body: { url }, auth: "staff" }).catch((e) => toast(errMsg(e), { tone: "danger" }));
    load();
  }
  async function saveNote() {
    await api(`/api/lab/orders/${id}/note`, { method: "PUT", body: { note }, auth: "staff" });
  }
  async function complete() {
    setBusy("complete");
    try {
      await saveNote();
      const r = await api<{ case_ready: boolean }>(`/api/lab/orders/${id}/complete`, { method: "POST", auth: "staff" });
      toast("Đã hoàn thành, kết quả đã khóa", { tone: "ok", body: r.case_ready ? "Mọi phiếu của ca đã xong, bác sĩ đã được báo" : "Bác sĩ đã được báo có kết quả" });
      load();
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  const files = o.result?.files ?? [];
  const amends = o.audit.filter((a) => a.action === "AMEND");
  return (
    <>
      <Link href="/nhan-vien/cls" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-3 hover:text-ink"><ChevronLeft className="size-4" aria-hidden />Phiếu cận lâm sàng</Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] font-bold tracking-tight">{o.service.name}</h1>
        <LabTag status={o.status} label={o.status_label} />
        {o.result?.is_amended && <AmendedTag />}
        <span className="text-ink-3">Phiếu #{o.id} · {o.department.name}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-5">
          <Panel title="Bệnh nhân" eyebrow={o.patient.full_name}>
            <KV rows={[["Giới, tuổi", `${genderLabel(o.patient.gender)}, ${o.patient.age} tuổi`], ["Năm sinh", o.patient.birth_year], ["Mã khám", <span key="c" className="mono">{o.appointment_code}</span>]]} />
          </Panel>
          <Panel title="Yêu cầu của bác sĩ" eyebrow={o.ordered_by.full_name}>
            <p className="text-[15px]">{o.doctor_note || <span className="text-ink-3">Không có ghi chú</span>}</p>
            <p className="mt-2 text-sm text-ink-3">Chỉ định lúc {dateTime(o.created_at)}</p>
          </Panel>
          {o.technician && <p className="text-sm text-ink-3">Thực hiện: <b className="text-ink">{o.technician.full_name}</b> · nhận lúc {dateTime(o.claimed_at)}</p>}
        </div>

        <Panel title={o.status === "DONE" ? "Kết quả đã khóa" : "Nhập kết quả"}
          actions={o.status === "DONE" ? <span className="flex items-center gap-1 text-sm text-ink-3"><Lock className="size-4" aria-hidden />{dateTime(o.completed_at)}</span> : null}>
          {o.status === "IN_PROGRESS" && !o.can_edit && <Alert tone="warn" className="mb-4">Phiếu do {o.technician?.full_name} nhận. Bạn chỉ xem được, không sửa được.</Alert>}
          {o.status === "ORDERED" && <Alert tone="info" className="mb-4">Phiếu chưa có người nhận. Quay lại danh sách để bấm “Nhận phiếu”.</Alert>}
          {o.status === "CANCELLED" && <Alert tone="warn" className="mb-4" title="Bác sĩ đã hủy phiếu">{o.cancel_reason}</Alert>}

          {o.can_edit && (
            <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
              className={cx("mb-4 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center", drag ? "border-lab bg-lab-tint" : "border-line-strong")}>
              <Upload className="size-7 text-ink-3" aria-hidden />
              <p className="font-semibold">Kéo thả ảnh hoặc PDF kết quả vào đây</p>
              <p className="text-sm text-ink-3">JPG, PNG, WEBP, PDF · tối đa 10 MB mỗi file</p>
              <Button variant="secondary" size="sm" loading={busy === "upload"} onClick={() => fileRef.current?.click()}>Chọn file</Button>
              <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
                onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
            </div>
          )}
          <FileGrid files={files} onRemove={o.can_edit ? removeFile : undefined} />

          <Field label="Nhận xét của kỹ thuật viên" className="mt-4">
            <Textarea rows={5} disabled={!o.can_edit} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => o.can_edit && saveNote()}
              placeholder="Mô tả kết quả, chỉ số bất thường…" />
          </Field>
          {o.can_edit && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line-2 pt-4">
              <p className="text-sm text-ink-3">Sau khi hoàn thành, kết quả bị khóa. Muốn sửa phải nhập lý do.</p>
              <Button size="lg" loading={busy === "complete"} disabled={!files.length && !note.trim()} onClick={complete}>
                <Lock className="size-4" aria-hidden />Hoàn thành &amp; khóa kết quả
              </Button>
            </div>
          )}
          {o.can_amend && (
            <div className="mt-4 border-t border-line-2 pt-4">
              <Button variant="secondary" onClick={() => setAmendOpen(true)}><Pencil className="size-4" aria-hidden />Sửa kết quả (cần lý do)</Button>
            </div>
          )}
          {amends.length > 0 && <div className="mt-5"><p className="eyebrow mb-2">Lịch sử chỉnh sửa</p><AmendHistory items={amends} /></div>}
        </Panel>
      </div>
      {o.can_amend && <AmendDialog open={amendOpen} id={o.id} files={files} note={o.result?.note ?? ""} onClose={() => setAmendOpen(false)} onDone={() => { setAmendOpen(false); load(); }} />}
    </>
  );
}

function FileGrid({ files, onRemove }: { files: FileT[]; onRemove?: (url: string) => void }) {
  if (!files.length) return <p className="text-sm text-ink-3">Chưa có file kết quả.</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {files.map((f) => (
        <div key={f.url} className="relative overflow-hidden rounded-md border border-line">
          <a href={f.url} target="_blank" rel="noreferrer" className="block">
            {f.type === "image"
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={f.url} alt={f.name} className="aspect-[4/3] w-full bg-paper object-cover" />
              : <span className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 bg-paper text-sm"><FileText className="size-7" aria-hidden />PDF</span>}
            <span className="block truncate px-2 py-1 text-[12.5px] text-ink-2">{f.name}</span>
          </a>
          {onRemove && (
            <button aria-label={`Xóa ${f.name}`} onClick={() => onRemove(f.url)} className="absolute top-1 right-1 rounded bg-surface/90 p-1 text-ink-2 hover:text-danger">
              <X className="size-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function AmendDialog({ open, id, files, note, onClose, onDone }: { open: boolean; id: number; files: FileT[]; note: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [n, setN] = useState(note);
  const [keep, setKeep] = useState<string[]>(files.map((f) => f.url));
  const [extra, setExtra] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    const form = new FormData();
    form.append("reason", reason);
    form.append("note", n);
    form.append("keep_urls", JSON.stringify(keep));
    extra.forEach((f) => form.append("files", f));
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/lab/orders/${id}/amend`, { form, auth: "staff" });
      toast("Đã sửa kết quả, bản cũ được lưu lại", { tone: "ok" });
      onDone();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Sửa kết quả đã khóa" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Hủy</Button><Button loading={busy} disabled={reason.trim().length < 5} onClick={submit}>Lưu chỉnh sửa</Button></>}>
      <Alert tone="warn" className="mb-4">Bản cũ được lưu vào nhật ký. Bác sĩ nhận thông báo và kết quả gắn nhãn “Đã chỉnh sửa”.</Alert>
      <div className="grid gap-4">
        <Field label="Lý do chỉnh sửa" required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: nhập nhầm chỉ số bạch cầu" /></Field>
        <Field label="Nhận xét"><Textarea rows={4} value={n} onChange={(e) => setN(e.target.value)} /></Field>
        {files.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">Giữ lại file</legend>
            {files.map((f) => (
              <label key={f.url} className="flex items-center gap-2 py-0.5 text-[15px]">
                <input type="checkbox" className="size-4" checked={keep.includes(f.url)} onChange={(e) => setKeep((k) => (e.target.checked ? [...k, f.url] : k.filter((x) => x !== f.url)))} />{f.name}
              </label>
            ))}
          </fieldset>
        )}
        <Field label="Thêm file mới"><input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setExtra(Array.from(e.target.files ?? []))} /></Field>
      </div>
      {err && <Alert tone="danger" className="mt-4">{err}</Alert>}
    </Dialog>
  );
}
