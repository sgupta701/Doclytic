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
            ? "bg-blue-100 text-blue-700 shadow-sm"
            : "text-gray-700 hover:bg-gray-100"
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
        className="md:hidden fixed top-4 left-4 z-50 bg-white p-2 rounded-lg shadow"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* SIDEBAR */}
      <aside
        className={`
    fixed md:sticky
    top-[73px]
    left-0
    h-[calc(100vh-73px)]
    bg-white
    border-r border-gray-200
    transition-all duration-300
    ${collapsed ? "w-20" : "w-64"}
    ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
  `}
      >
        {/* HEADER */}
        <div className="p-4 border-b flex items-center justify-between">
          {!collapsed ? (
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-center text-lg font-semibold shadow">
                {profile?.full_name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {profile?.full_name}
                </p>
                <p className="text-xs text-gray-500">
                  {profile?.designation || "User"}
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
                {profile?.full_name?.charAt(0).toUpperCase()}
              </div>
            </div>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 rounded-lg hover:bg-gray-100 transition"
          >
            {collapsed ? <Menu size={20} /> : <X size={20} />}
          </button>
        </div>

        {/* NAVIGATION */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {/* Main */}
          {menuItems.map((item) => (
            <NavItem key={item.path} item={item} />
          ))}

          {/* Departments */}
          {!collapsed && (
            <div className="pt-4 mt-4 border-t">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Departments
              </h3>
            </div>
          )}

          {departmentItems.map((item) => (
            <NavItem key={item.path} item={item} />
          ))}

          {/* Settings */}
          <div className="pt-4 mt-4 border-t">
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
        <div className="p-4 border-t">
          <button
            onClick={signOut}
            className="w-full flex items-center space-x-3 p-3 rounded-xl text-red-600 hover:bg-red-50 transition"
          >
            <LogOut className="w-5 h-5" />
            {!collapsed && (
              <span className="text-sm font-medium">Logout</span>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
