import { io } from "socket.io-client";
import { useState, useEffect, useRef } from "react";
import { Bell, Globe, LogOut, User, Check } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

interface NotificationType {
  _id: string;
  title: string;
  message: string;
  createdAt: string;
  document_id?: string;
  isRead?: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const translationCache = new Map<string, string>();

export default function TopNav() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Language State
  const [language, setLanguage] = useState(
    localStorage.getItem("appLanguage") || "en"
  );

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const isNotificationRead = (notification: NotificationType) =>
    Boolean(notification.isRead);

  useEffect(() => {
    if (profile) loadNotifications();
  }, [profile, language]); // reload when language changes

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const socket = io(import.meta.env.VITE_BACKEND_URL || "http://localhost:5000", {
      auth: { token },
    });

    socket.on("new-notification", async (data) => {
      if (language === "hi") {
        const translated = {
          ...data,
          title: await translateText(data.title || "Notification"),
          message: await translateText(data.message),
        };
        setNotifications((prev) => [translated, ...prev]);
      } else {
        setNotifications((prev) => [data, ...prev]);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [language]);

  // Click outside close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setShowProfileMenu(false);

      if (notifRef.current && !notifRef.current.contains(e.target as Node))
        setShowNotifications(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("token");
    const headers = {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    };
    return fetch(url, { ...options, headers });
  };

  const translateText = async (text: string) => {
    const normalizedText = typeof text === "string" ? text.trim() : "";
    if (!normalizedText) return text;
    if (language !== "hi") return text;

    const cacheKey = `${language}:${normalizedText}`;
    const cached = translationCache.get(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(`${API_URL}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: normalizedText,
          target: language,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.translatedText !== "string") {
        console.error("Translation API error:", data);
        return text;
      }

      const translated = data.translatedText.trim() || text;
      translationCache.set(cacheKey, translated);
      return translated;
    } catch (err) {
      console.error("Translation error:", err);
      return text;
    }
  };

  const loadNotifications = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/notifications/my`);
      if (!res.ok) return;
      const data = await res.json();

      if (language === "hi") {
        const translated = await Promise.all(
          data.map(async (n: NotificationType) => ({
            ...n,
            title: await translateText(n.title),
            message: await translateText(n.message),
          }))
        );
        setNotifications(translated);
      } else {
        setNotifications(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openNotification = async (n: NotificationType) => {
    try {
      await authFetch(`${API_URL}/api/notifications/mark-read`, {
        method: "PUT",
      });
    } catch (err) {
      console.error(err);
    }

    setNotifications((prev) =>
      prev.map((item) => ({ ...item, isRead: true }))
    );

    if (n.document_id) navigate(`/document/${n.document_id}`);
    setShowNotifications(false);
  };

  const markAllAsRead = async () => {
    try {
      await authFetch(`${API_URL}/api/notifications/mark-read`, {
        method: "PUT",
      });
    } catch (err) {
      console.error(err);
    }

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true }))
    );
  };

  const unreadCount = notifications.filter((n) => !isNotificationRead(n)).length;
  const unreadLabel =
    unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : "";

  const formatNotificationTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/88 px-3 py-2 backdrop-blur-xl shadow-[0_14px_30px_-24px_rgba(15,23,42,0.45)] sm:px-4 lg:px-6">
      <div className="flex items-center justify-between gap-3">

        {/* Logo */}
        <div className="flex min-w-0 items-center gap-3 shrink-0">
          <img 
            src="/logo.png" 
            alt="Doclytic" 
            className="h-10 w-auto max-w-none shrink-0 object-contain drop-shadow-sm sm:h-12 lg:h-14" 
          />
        </div>

        <div className="flex items-center gap-1 sm:gap-2 lg:gap-3">

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className={`relative flex h-11 w-11 items-center justify-center rounded-2xl border transition-all duration-200 ${
                showNotifications
                  ? "border-blue-200 bg-blue-50 text-blue-700 shadow-[0_12px_30px_-18px_rgba(37,99,235,0.55)]"
                  : "border-slate-200/80 bg-white/90 text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)]"
              }`}
              aria-label="Open notifications"
            >
              <Bell className="h-5 w-5 sm:h-[1.35rem] sm:w-[1.35rem]" />
              {unreadCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex min-w-[1.5rem] items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-lg ring-2 ring-white">
                  {unreadLabel}
                </span>
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 mt-4 w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-[1.6rem] border border-slate-200/80 bg-white/95 shadow-[0_28px_70px_-32px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:w-[25rem]"
                >
                  <div className="flex items-center justify-between border-b border-slate-200/80 bg-[linear-gradient(135deg,_rgba(239,246,255,0.95),_rgba(248,250,252,0.96))] px-4 py-4 sm:px-5">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Notifications
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {unreadCount > 0
                          ? `${unreadCount} unread update${unreadCount > 1 ? "s" : ""}`
                          : "You're all caught up"}
                      </p>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
                      >
                        <Check className="w-4 h-4" />
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="max-h-[70vh] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                          <Bell className="h-6 w-6" />
                        </div>
                        <p className="text-base font-semibold text-slate-700">
                          No notifications yet
                        </p>
                        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
                          New uploads, comments, and routing updates will show up here.
                        </p>
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n._id}
                          onClick={() => openNotification(n)}
                          className={`group relative flex w-full items-start gap-3 border-b border-slate-100 px-4 py-4 text-left transition last:border-b-0 sm:px-5 ${
                            isNotificationRead(n)
                              ? "bg-white hover:bg-slate-50"
                              : "bg-blue-50/70 hover:bg-blue-50"
                          }`}
                        >
                          <div
                            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                              isNotificationRead(n)
                                ? "bg-slate-200"
                                : "bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.16)]"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="line-clamp-1 pr-1 text-sm font-semibold text-slate-800">
                                {n.title}
                              </p>
                              {!isNotificationRead(n) && (
                                <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                                  New
                                </span>
                              )}
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-600">
                              {n.message}
                            </p>
                            <span className="mt-2 block text-xs font-medium text-slate-400">
                              {formatNotificationTime(n.createdAt)}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 🌍 Language Toggle (Functionality Added Only) */}
          <button
            onClick={() => {
              const newLang = language === "en" ? "hi" : "en";
              setLanguage(newLang);
              localStorage.setItem("appLanguage", newLang);
            }}
            className="rounded-xl p-2 transition hover:bg-slate-100"
          >
            <Globe className="h-5 w-5 text-slate-700 sm:h-6 sm:w-6" />
          </button>

          {/* Profile */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 rounded-xl px-2 py-2 transition hover:bg-slate-100 sm:gap-3 sm:px-3"
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name || "User"}
                  className="h-8 w-8 rounded-full object-cover shadow sm:h-9 sm:w-9"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-sm font-semibold text-white shadow sm:h-9 sm:w-9">
                  {profile?.full_name?.charAt(0).toUpperCase() || "U"}
                </div>
              )}
              <span className="hidden max-w-[10rem] truncate text-sm font-medium text-slate-800 lg:block">
                {profile?.full_name}
              </span>
            </button>

            <AnimatePresence>
              {showProfileMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 mt-4 w-60 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
                >
                  <div className="px-5 py-4 border-b bg-gray-50">
                    <p className="font-semibold text-gray-800">
                      {profile?.full_name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {profile?.email}
                    </p>
                  </div>

                  <button
                    onClick={() => navigate("/profile")}
                    className="w-full px-5 py-3 text-left hover:bg-gray-100 transition flex items-center gap-3 text-gray-700"
                  >
                    <User className="w-5 h-5" />
                    View Profile
                  </button>

                  <button
                    onClick={async () => {
                      await signOut();
                      navigate("/login");
                    }}
                    className="w-full px-5 py-3 text-left hover:bg-red-50 transition flex items-center gap-3 text-red-600"
                  >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </nav>
  );
}
