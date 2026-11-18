"use client";
import { useEffect, useState } from "react";
import { PageHead, StaffShell } from "@/components/staff-shell";
import { Alert, Button, Field, Input, Panel, Spinner } from "@/components/ui";
import { toast } from "@/components/toast";
import { api, errMsg } from "@/lib/api";

interface Setting { key: string; value: string; label: string }

export default function Page() {
  return <StaffShell roles={["ADMIN"]}>{() => <Settings />}</StaffShell>;
}

function Settings() {
  const [rows, setRows] = useState<Setting[] | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<Setting[]>("/api/admin/settings", { auth: "staff" }).then((r) => { setRows(r); setVals(Object.fromEntries(r.map((x) => [x.key, x.value]))); }).catch(() => setRows([]));
  }, []);
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/admin/settings", { method: "PUT", body: vals, auth: "staff" });
      toast("Đã lưu tham số", { tone: "ok", body: "Áp dụng cho lịch hẹn tạo mới" });
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  if (!rows) return <Spinner />;
  const money = ["deposit_amount", "consultation_fee"];
  return (
    <>
      <PageHead eyebrow="Quản trị" title="Tham số hệ thống" />
      <Panel>
        {err && <Alert tone="danger" className="mb-4">{err}</Alert>}
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <Field key={r.key} label={r.label} hint={<span className="mono">{r.key}</span>}>
              <Input value={vals[r.key] ?? ""} inputMode={money.includes(r.key) ? "numeric" : undefined} onChange={(e) => setVals({ ...vals, [r.key]: e.target.value })} />
            </Field>
          ))}
        </div>
        <div className="mt-5 flex justify-end"><Button loading={busy} onClick={save}>Lưu tham số</Button></div>
      </Panel>
    </>
  );
}
