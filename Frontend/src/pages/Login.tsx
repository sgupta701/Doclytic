// src/pages/Login.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signIn } = useAuth();
  const navigate = useNavigate();

  // ✅ Check if user is already logged in
  useEffect(() => {
    const token = localStorage.getItem("token");
    const profile = localStorage.getItem("profile");
    
    if (token && profile) {
      console.log("🔵 User already logged in, redirecting to dashboard");
      navigate("/dashboard");
    }
  }, [navigate]);

  const handleGoogleLogin = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/mail/google', {
        credentials: 'include',
      });

      const data = await res.json();
      if (data.authUrl) {
        console.log("🔵 Redirecting to Google OAuth");
        window.location.href = data.authUrl;
      }
    } catch (err) {
      console.error('Google login failed', err);
      setError('Google login failed. Try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 dark:bg-gradient-to-br dark:from-blue-950 dark:via-black dark:to-blue-950 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid md:grid-cols-2 gap-8 items-center">
        
        {/* Left Panel */}
        <div className="hidden md:flex flex-col items-center justify-center p-12">
          <div className="bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm rounded-3xl p-12 shadow-xl">
            <img 
            src="/logoTransparent.png" 
            alt="Doclytic" 
            className="h-10 w-auto max-w-none shrink-0 object-contain drop-shadow-sm sm:h-12 lg:h-14" 
          />
            <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-200 mb-4">
              Unified Document Intelligence System
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              Streamline your document management with automation
            </p>
          </div>
        </div>

        {/* Right Panel */}
        <div className="bg-white dark:bg-gray-950 rounded-2xl shadow-2xl p-8 md:p-12">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Welcome Back</h1>
            <p className="text-gray-600 dark:text-gray-400">Sign in to access your dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 dark:bg-red-950/70 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 dark:bg-slate-950 dark:text-white border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  placeholder="your.email@company.com"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-600" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-10 py-3 dark:bg-slate-950 dark:text-white border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>

            {/* Buttons */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 dark:bg-blue-400 dark:hover:bg-blue-300 hover:bg-blue-700 text-white dark:text-black py-3 rounded-lg transition-all disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500 dark:bg-slate-950 dark:text-gray-400">Or continue with</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full dark:text-white border border-gray-300 dark:border-gray-700 py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-900 transition-all"
            >
              <Mail className="w-5 h-5" /> Sign in with Google
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}