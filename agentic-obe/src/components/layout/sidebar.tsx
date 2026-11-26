'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, BookOpen, Target, ClipboardCheck, BarChart3, FileText, Settings,
  ChevronsLeft, ChevronsRight, GraduationCap, Users, Brain, Award, X, Sparkles,
} from 'lucide-react';

type NavItem = { name: string; href: string; icon: React.ElementType };
type NavGroup = { label: string; items: NavItem[] };

const STAFF_NAV: NavGroup[] = [
  { label: 'Overview', items: [{ name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }] },
  {
    label: 'Planning',
    items: [
      { name: 'AI Course Planner', href: '/dashboard/planner', icon: Brain },
      { name: 'Courses & Schedule', href: '/dashboard/courses', icon: BookOpen },
    ],
  },
  {
    label: 'Outcomes',
    items: [
      { name: 'CLO/PLO Management', href: '/dashboard/mapping', icon: Target },
      { name: 'Assessments', href: '/dashboard/assessments', icon: ClipboardCheck },
      { name: 'Students & Marks', href: '/dashboard/students', icon: Users },
    ],
  },
  {
    label: 'Insights',
    items: [
      { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
      { name: 'Reports', href: '/dashboard/reports', icon: FileText },
    ],
  },
  { label: 'System', items: [{ name: 'Settings', href: '/dashboard/settings', icon: Settings }] },
];
const STUDENT_NAV: NavGroup[] = [{ label: 'My Learning', items: [{ name: 'My Results', href: '/dashboard', icon: Award }] }];

export function Sidebar({
  role,
  collapsed = false,
  onToggleCollapse,
  onClose,
}: {
  role: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** set when rendered as the mobile drawer */
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const groups = role === 'student' ? STUDENT_NAV : STAFF_NAV;

  return (
    <aside
      className={cn(
        'no-print relative flex h-full flex-col overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 text-white transition-[width] duration-300',
        collapsed ? 'w-[76px]' : 'w-72'
      )}
    >
      <div className="pointer-events-none absolute -left-16 top-1/3 h-56 w-56 rounded-full bg-indigo-600/20 blur-3xl" />

      <div className="relative flex h-16 items-center justify-between gap-2 border-b border-white/10 px-4">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5" onClick={onClose}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-sky-400 shadow-lg shadow-indigo-500/30">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <span className="truncate font-display text-lg font-extrabold tracking-tight">
              Agentic <span className="bg-gradient-to-r from-indigo-300 to-sky-300 bg-clip-text text-transparent">OBE</span>
            </span>
          )}
        </Link>
        {onClose ? (
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        ) : (
          !collapsed && (
            <button onClick={onToggleCollapse} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Collapse sidebar">
              <ChevronsLeft className="h-5 w-5" />
            </button>
          )
        )}
      </div>

      <nav className="relative flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {groups.map((g) => (
          <div key={g.label}>
            {!collapsed && <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{g.label}</p>}
            <div className="space-y-1">
              {g.items.map((item) => {
                const active = item.href === '/dashboard' ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    title={collapsed ? item.name : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                      collapsed && 'justify-center',
                      active
                        ? 'bg-gradient-to-r from-indigo-500/90 to-indigo-600/70 text-white shadow-lg shadow-indigo-900/40 ring-1 ring-inset ring-white/15'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                    )}
                  >
                    <item.icon className={cn('h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110', active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-300')} />
                    {!collapsed && <span className="truncate">{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="relative border-t border-white/10 p-3">
        {collapsed ? (
          <button onClick={onToggleCollapse} className="flex w-full justify-center rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Expand sidebar">
            <ChevronsRight className="h-5 w-5" />
          </button>
        ) : (
          <div className="rounded-xl bg-white/[0.06] p-3 ring-1 ring-inset ring-white/10">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" /> AI suggests, you approve
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Agentic OBE v1.0 · Outcome-Based Education planning</p>
          </div>
        )}
      </div>
    </aside>
  );
}
