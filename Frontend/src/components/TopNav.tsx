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
  is_read: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const socket = io(import.meta.env.VITE_BACKEND_URL || "http://localhost:5000");

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

  useEffect(() => {
    if (profile) loadNotifications();
  }, [profile, language]); // reload when language changes

  useEffect(() => {
    socket.on("new-notification", async (data) => {
      if (language === "hi") {
        const translated = {
          ...data,
          title: await translateText(data.title),
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
  try {
    const res = await fetch(`${API_URL}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        target: language === "hi" ? "Hindi" : "English",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(data);
      return text;
    }

    return data.translatedText;

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

  const openNotification = (n: NotificationType) => {
    if (n.document_id) navigate(`/api/documents/${n.document_id}`);
    setShowNotifications(false);
  };

  const markAllAsRead = () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true }))
    );
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <nav className="bg-white/80 backdrop-blur-lg border-b border-gray-200 px-8 py-4 sticky top-0 z-50 shadow-md">
      <div className="flex items-center justify-between">

        {/* Logo */}
        <div className="flex items-center gap-6">
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            UDIS
          </h1>
          <span className="text-gray-700 font-medium hidden md:block">
            Document Intelligence Platform
          </span>
        </div>

        <div className="flex items-center gap-4">

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-xl hover:bg-gray-100 transition"
            >
              <Bell className="w-6 h-6 text-gray-700" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs
                  rounded-full w-5 h-5 flex items-center justify-center shadow animate-pulse">
                  {unreadCount}
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
                  className="absolute right-0 mt-4 w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
                >
                  <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="font-semibold text-gray-800">
                      Notifications
                    </h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <Check className="w-4 h-4" />
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-gray-500">
                        No notifications
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n._id}
                          onClick={() => openNotification(n)}
                          className={`px-6 py-4 border-b cursor-pointer transition
                          ${n.is_read ? "bg-white" : "bg-blue-50"}
                          hover:bg-gray-100`}
                        >
                          <p className="font-semibold text-gray-800">
                            {n.title}
                          </p>
                          <p className="text-sm text-gray-600 mt-1">
                            {n.message}
                          </p>
                          <span className="text-xs text-gray-400 mt-2 block">
                            {new Date(n.createdAt).toLocaleString()}
                          </span>
                        </div>
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
            className="p-2 rounded-xl hover:bg-gray-100 transition"
          >
            <Globe className="w-6 h-6 text-gray-700" />
          </button>

          {/* Profile */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-100 transition"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-center font-semibold shadow">
                {profile?.full_name?.charAt(0).toUpperCase() || "U"}
              </div>
              <span className="text-gray-800 font-medium hidden sm:block">
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
                  className="absolute right-0 mt-4 w-60 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
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