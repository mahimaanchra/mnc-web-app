import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loader2 } from "lucide-react";

/**
 * Wraps any route that requires admin authentication.
 * - While Firebase resolves the initial auth state, shows a full-screen loader.
 * - Unauthenticated users are redirected to /admin/login, with `from` stored
 *   in location.state so AdminLogin can redirect back after a successful sign-in.
 */
export default function ProtectedRoute({ children }) {
  const { currentUser, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <Loader2 size={32} className="text-[#f5a623] animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return children;
}
