import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Calendar,
  Settings,
  Users,
  DollarSign,
  Scale,
  Briefcase,
  ShoppingCart,
  Menu,
  X,
  LogOut,
  AlertTriangle,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { TAB_PULSE_EVENT } from "../utils/tabPulse";

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tabPulseUntil, setTabPulseUntil] = useState<Record<string, number>>({});

  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuth();

  const isActiveRoute = (path: string) =>
    location.pathname === path ||
    location.pathname.startsWith(path + "/");

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Calendar, label: "Compliance Calendar", path: "/calendar" },
    { icon: AlertTriangle, label: "Manual Review", path: "/manual-review" },
  ];

  const departmentItems = [
    { icon: Users, label: "HR", path: "/department/hr", color: "#10B981" },
    { icon: DollarSign, label: "Finance", path: "/department/finance", color: "#3B82F6" },
    { icon: Scale, label: "Legal", path: "/department/legal", color: "#8B5CF6" },
    { icon: Briefcase, label: "Operations", path: "/department/operations", color: "#F59E0B" },
    { icon: ShoppingCart, label: "Procurement", path: "/department/procurement", color: "#EF4444" },
  ];

  useEffect(() => {
    const handlePulse = (evt: Event) => {
      const custom = evt as CustomEvent<{ path?: string; durationMs?: number }>;
      const path = custom.detail?.path;
      const durationMs = custom.detail?.durationMs ?? 5000;
      if (!path) return;
      setTabPulseUntil((prev) => ({ ...prev, [path]: Date.now() + durationMs }));
    };

    const timer = setInterval(() => {
      const now = Date.now();
      setTabPulseUntil((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const [path, until] of Object.entries(prev)) {
          if (until <= now) {
            delete next[path];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 500);

    window.addEventListener(TAB_PULSE_EVENT, handlePulse as EventListener);
    return () => {
      window.removeEventListener(TAB_PULSE_EVENT, handlePulse as EventListener);
      clearInterval(timer);
    };
  }, []);

  const NavItem = ({ item }: any) => {
    const Icon = item.icon;
    const active = isActiveRoute(item.path);
    const showPulse = (tabPulseUntil[item.path] || 0) > Date.now();

    return (
      <button
        onClick={() => {
          navigate(item.path);
          setMobileOpen(false);
        }}
        title={collapsed ? item.label : ""}
        className={`group relative w-full flex items-center space-x-3 p-3 rounded-xl transition-all duration-200
          ${active
            ? "bg-blue-100 dark:bg-blue-900/80 text-blue-700 dark:text-blue-300 shadow-sm"
            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/80"
          }`}
      >
        <Icon
          className="w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110"
          style={{ color: item.color || (active ? "#2563EB" : "") }}
        />

        {!collapsed && (
          <span className="text-sm font-medium tracking-wide flex items-center gap-2">
            {item.label}
            {showPulse && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
          </span>
        )}

        {collapsed && showPulse && (
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        )}

        {active && (
          <div className="absolute right-0 h-6 w-1 bg-blue-600 rounded-l-full" />
        )}
      </button>
    );
  };

  return (
    <>
      {/* MOBILE OVERLAY */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* MOBILE TOGGLE BUTTON */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-50 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-gray-900 dark:text-gray-300 p-2.5 shadow-lg backdrop-blur md:hidden"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* SIDEBAR */}
      <aside
        className={`
          fixed top-[73px] left-0 h-[calc(100vh-73px)] bg-[linear-gradient(180deg,rgba(239,246,255,0.95)_0%,rgba(232,240,255,0.94)_100%)] dark:bg-[linear-gradient(180deg,_rgba(15,23,42,0.98)_0%,_rgba(10,15,30,0.99)_100%)]
          backdrop-blur-xl border-r border-blue-200/80 dark:border-slate-800/80 transition-all duration-300
          ${collapsed ? "w-20" : "w-64"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          md:translate-x-0 md:z-auto
          z-50
        `}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-blue-200/70 dark:border-slate-800/80 p-4">
          {!collapsed ? (
            <div className="flex items-center space-x-3 min-w-0">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name || "User"}
                  className="h-10 w-10 rounded-full object-cover shadow"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-lg font-semibold text-white dark:text-black shadow">
                  {profile?.full_name?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {profile?.full_name}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {profile?.designation || "User"}
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name || "User"}
                  className="w-8 h-8 rounded-full object-cover shadow"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white dark:text-black flex items-center justify-center text-sm font-semibold">
                  {profile?.full_name?.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-lg p-2 transition hover:bg-white/70 dark:hover:bg-gray-800/80 dark:text-white"
          >
            {collapsed ? <Menu size={20} /> : <X size={20} />}
          </button>
        </div>

        {/* NAVIGATION */}
        <nav className="flex-1 space-y-2 overflow-y-auto p-4">
          {/* Main */}
          {menuItems.map((item) => (
            <NavItem key={item.path} item={item} />
          ))}

          {/* Departments */}
          {!collapsed && (
            <div className="mt-4 border-t border-blue-200/70 dark:border-blue-800/70 pt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                Departments
              </h3>
            </div>
          )}

          {departmentItems.map((item) => (
            <NavItem key={item.path} item={item} />
          ))}

          {/* Settings */}
          <div className="mt-4 border-t border-blue-200/70 dark:border-blue-800/70 pt-4">
            <NavItem
              item={{
                icon: Settings,
                label: "Settings",
                path: "/settings",
              }}
            />
          </div>
        </nav>

        {/* FOOTER */}
        {/* <div className="p-4 border-t">
          <button
            onClick={signOut}
            className="w-full flex items-center space-x-3 p-3 rounded-xl text-red-600 hover:bg-red-50 transition"
          >
            <LogOut className="w-5 h-5" />
            {!collapsed && (
              <span className="text-sm font-medium">Logout</span>
            )}
          </button>
        </div> */}
      </aside>
    </>
  );
}
