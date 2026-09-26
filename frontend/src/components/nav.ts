import {
  Columns2,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Stethoscope,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "../lib/api";

export interface NavItem {
  href: string;
  key: string;
  icon: LucideIcon;
  roles: Role[];
  group: "workspace" | "safety" | "account";
}

export const NAV: NavItem[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard, roles: ["doctor"], group: "workspace" },
  { href: "/worklist", key: "worklist", icon: ListChecks, roles: ["doctor"], group: "workspace" },
  { href: "/analyze", key: "analyze", icon: Stethoscope, roles: ["doctor"], group: "workspace" },
  { href: "/compare", key: "compare", icon: Columns2, roles: ["doctor"], group: "workspace" },
  { href: "/training", key: "training", icon: GraduationCap, roles: ["doctor"], group: "safety" },
  { href: "/monitor", key: "monitor", icon: ShieldCheck, roles: ["doctor"], group: "safety" },
  { href: "/settings", key: "settings", icon: Settings, roles: ["doctor"], group: "account" },
];
