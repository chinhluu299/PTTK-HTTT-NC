"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Alert, Button, Dialog, Field, Input, Select, Spinner, Tag, Textarea, cx } from "./ui";
import { toast } from "./toast";
import { api, errMsg } from "@/lib/api";

export type FieldDef = {
  key: string; label: string; type?: "text" | "number" | "select" | "checkbox" | "textarea" | "password" | "ingredients";
  options?: { value: string | number; label: string }[]; required?: boolean; hint?: string; show?: (f: Record<string, unknown>) => boolean;
  wide?: boolean; editOnly?: boolean; createOnly?: boolean;
};
export type Col<T> = { label: string; render: (r: T) => ReactNode; className?: string };

/** Bảng danh mục + hộp thoại thêm/sửa. Danh mục chỉ trình bày ngắn (mục V của đặc tả). */
export function Crud<T extends { id: number }>({ endpoint, cols, fields, title, empty, toForm, ingredientOptions }: {
  endpoint: string; cols: Col<T>[]; fields: FieldDef[]; title: string; empty: Record<string, unknown>;
  toForm?: (r: T) => Record<string, unknown>; ingredientOptions?: { value: number; label: string }[];
}) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [edit, setEdit] = useState<{ id: number | null; f: Record<string, unknown> } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<T[]>(endpoint, { auth: "staff" }).then(setRows).catch(() => setRows([])), [endpoint]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!edit) return;
    setBusy(true);
    setErr(null);
    const body: Record<string, unknown> = {};
    for (const fd of fields) {
      if (fd.show && !fd.show(edit.f)) { body[fd.key] = null; continue; }
      let v = edit.f[fd.key];
      if (fd.type === "number" || (fd.type === "select" && typeof fd.options?.[0]?.value === "number")) v = v === "" || v === null || v === undefined ? null : Number(v);
      if (fd.type === "text" || fd.type === "textarea") v = typeof v === "string" ? v : "";
      body[fd.key] = v;
    }
    try {
      await api(edit.id ? `${endpoint}/${edit.id}` : endpoint, { method: edit.id ? "PUT" : "POST", body, auth: "staff" });
      toast("Đã lưu", { tone: "ok" });
      setEdit(null);
      load();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const set = (k: string, v: unknown) => setEdit((e) => (e ? { ...e, f: { ...e.f, [k]: v } } : e));

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{title} {rows && <span className="num font-normal text-ink-3">{rows.length}</span>}</h2>
        <Button size="sm" onClick={() => { setErr(null); setEdit({ id: null, f: { ...empty } }); }}><Plus className="size-4" aria-hidden />Thêm</Button>
      </div>
      {!rows ? <Spinner /> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
          <table className="w-full min-w-[640px] text-[14.5px]">
            <thead>
              <tr className="border-b border-line text-left bg-paper text-[12.5px] font-semibold text-ink-3">
                {cols.map((c) => <th key={c.label} className={cx("px-4 py-2.5", c.className)}>{c.label}</th>)}
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line-2 last:border-0 hover:bg-paper/60">
                  {cols.map((c) => <td key={c.label} className={cx("px-4 py-2.5", c.className)}>{c.render(r)}</td>)}
                  <td className="px-2 text-right">
                    <button aria-label="Sửa" onClick={() => { setErr(null); setEdit({ id: r.id, f: toForm ? toForm(r) : { ...(r as unknown as Record<string, unknown>) } }); }}
                      className="rounded p-1.5 text-ink-3 hover:bg-brand-tint hover:text-brand"><Pencil className="size-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Sửa ${title.toLowerCase()}` : `Thêm ${title.toLowerCase()}`}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Hủy</Button><Button loading={busy} onClick={save}>Lưu</Button></>}>
        {err && <Alert tone="danger" className="mb-3">{err}</Alert>}
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.filter((fd) => (!fd.show || fd.show(edit.f)) && !(fd.editOnly && !edit.id) && !(fd.createOnly && edit.id)).map((fd) => {
              const v = edit.f[fd.key];
              if (fd.type === "checkbox") {
                return (
                  <label key={fd.key} className="flex items-center gap-2 self-end pb-2 font-semibold sm:col-span-2">
                    <input type="checkbox" className="size-5" checked={!!v} onChange={(e) => set(fd.key, e.target.checked)} />{fd.label}
                  </label>
                );
              }
              if (fd.type === "ingredients") {
                const list = (v as { ingredient_id: number | string; amount: number | string }[]) ?? [];
                return (
                  <Field key={fd.key} label={fd.label} required hint={fd.hint} className="sm:col-span-2">
                    <div className="space-y-2">
                      {list.map((it, i) => (
                        <div key={i} className="flex gap-2">
                          <Select value={String(it.ingredient_id)} onChange={(e) => set(fd.key, list.map((x, j) => (j === i ? { ...x, ingredient_id: Number(e.target.value) } : x)))}>
                            <option value="">— Hoạt chất —</option>
                            {ingredientOptions?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </Select>
                          <Input className="!w-32" inputMode="decimal" placeholder="mg / đơn vị" value={String(it.amount)} onChange={(e) => set(fd.key, list.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                          <button aria-label="Bỏ hoạt chất" onClick={() => set(fd.key, list.filter((_, j) => j !== i))} className="rounded px-2 text-ink-3 hover:text-danger"><Trash2 className="size-4" /></button>
                        </div>
                      ))}
                      <Button size="sm" variant="secondary" onClick={() => set(fd.key, [...list, { ingredient_id: "", amount: "" }])}><Plus className="size-4" aria-hidden />Thêm hoạt chất</Button>
                    </div>
                  </Field>
                );
              }
              return (
                <Field key={fd.key} label={fd.label} required={fd.required} hint={fd.hint} className={fd.wide || fd.type === "textarea" ? "sm:col-span-2" : undefined}>
                  {fd.type === "select" ? (
                    <Select value={v === null || v === undefined ? "" : String(v)} onChange={(e) => set(fd.key, e.target.value)}>
                      <option value="">— Chọn —</option>
                      {fd.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  ) : fd.type === "textarea" ? (
                    <Textarea rows={2} value={(v as string) ?? ""} onChange={(e) => set(fd.key, e.target.value)} />
                  ) : (
                    <Input type={fd.type === "password" ? "password" : "text"} inputMode={fd.type === "number" ? "decimal" : undefined}
                      value={v === null || v === undefined ? "" : String(v)} onChange={(e) => set(fd.key, e.target.value)} />
                  )}
                </Field>
              );
            })}
          </div>
        )}
      </Dialog>
    </section>
  );
}

export function ActiveTag({ on }: { on: boolean }) {
  return on ? <Tag className="border-ok/30 bg-ok-tint text-ok">Đang dùng</Tag> : <Tag className="border-line bg-paper text-ink-3">Ngừng</Tag>;
}
