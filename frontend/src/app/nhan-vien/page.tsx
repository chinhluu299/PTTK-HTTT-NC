"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ROLE_HOME } from "@/components/staff-shell";
import { Spinner } from "@/components/ui";
import { useStaff } from "@/lib/hooks";

export default function Page() {
  const { staff, loading } = useStaff();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(staff ? ROLE_HOME[staff.role] : "/nhan-vien/dang-nhap");
  }, [staff, loading, router]);
  return <Spinner />;
}
