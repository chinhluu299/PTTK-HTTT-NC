import {
  Baby, Bean, Bone, Brain, Droplet, Ear, Eye, Hand, HeartPulse, Soup, Stethoscope, Wind, type LucideIcon,
} from "lucide-react";

/** Biểu tượng theo tên chuyên khoa (danh mục chuyên khoa do quản trị viên đặt tên) */
const SPEC_ICON: [RegExp, LucideIcon][] = [
  [/tổng quát/i, Stethoscope], [/xương|khớp/i, Bone], [/da liễu/i, Hand], [/hô hấp/i, Wind], [/mắt/i, Eye],
  [/nội tiết/i, Droplet], [/sản|phụ/i, Baby], [/tai|mũi|họng/i, Ear], [/thần kinh/i, Brain], [/thận|tiết niệu/i, Bean],
  [/tiêu hóa|tiêu hoá/i, Soup], [/tim/i, HeartPulse],
];

export const specIcon = (name: string): LucideIcon => SPEC_ICON.find(([r]) => r.test(name))?.[1] ?? Stethoscope;
