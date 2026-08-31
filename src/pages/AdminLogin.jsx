import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase/config";
import { motion } from "framer-motion";
import { Coffee, Mail, Lock, Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";

export default function AdminLogin() {
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  const navigate  = useNavigate();
  const location  = useLocation();
  const from      = location.state?.from?.pathname ?? "/admin";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      // Map Firebase error codes to friendly messages
      const code = err.code ?? "";
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("Incorrect email or password.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many failed attempts. Try again later or reset your password.");
      } else if (code === "auth/invalid-email") {
        setError("That doesn't look like a valid email.");
      } else {
        setError("Sign-in failed. Check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm"
      >
        {/* Back to home */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[#9a9a9a] hover:text-white
                     text-sm mb-8 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to home
        </Link>

        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#f5a623] to-[#f07020]
                          flex items-center justify-center shadow-lg shadow-[#f5a623]/20">
            <Coffee size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">Admin Login</h1>
            <p className="text-[#9a9a9a] text-xs">Mid Night Coffee</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#242424] border border-[#2e2e2e] rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-[#9a9a9a] mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2
                                            text-[#9a9a9a] pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@midnightcoffee.in"
                  autoComplete="email"
                  className="w-full bg-[#1a1a1a] border border-[#3a3a3a] text-white placeholder-[#555]
                             rounded-xl pl-9 pr-4 py-2.5 text-sm
                             focus:outline-none focus:border-[#f5a623] focus:ring-1 focus:ring-[#f5a623]/40
                             transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-[#9a9a9a] mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2
                                           text-[#9a9a9a] pointer-events-none" />
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-[#1a1a1a] border border-[#3a3a3a] text-white placeholder-[#555]
                             rounded-xl pl-9 pr-10 py-2.5 text-sm
                             focus:outline-none focus:border-[#f5a623] focus:ring-1 focus:ring-[#f5a623]/40
                             transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9a9a9a]
                             hover:text-white transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-400 text-xs bg-red-900/20 border border-red-800/40
                           rounded-lg px-3 py-2"
              >
                ⚠ {error}
              </motion.p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2
                         bg-[#f5a623] hover:bg-[#e08a00] disabled:opacity-60 disabled:cursor-not-allowed
                         text-[#1a1a1a] font-bold py-3 rounded-xl text-sm
                         transition-colors shadow-lg shadow-[#f5a623]/20 mt-2"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Signing in…</>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[#555] text-xs mt-6">
          Only authorised staff can access the admin panel.
        </p>
      </motion.div>
    </div>
  );
}
