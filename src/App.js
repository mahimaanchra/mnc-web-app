import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import { AuthProvider }  from "./context/AuthContext";
import ProtectedRoute    from "./components/ProtectedRoute";
import HomePage          from "./pages/HomePage";
import CustomerMenu      from "./pages/CustomerMenu";
import AdminLogin        from "./pages/AdminLogin";
import AdminMenu         from "./components/AdminMenu";

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public */}
          <Route path="/"            element={<HomePage />} />
          <Route path="/menu"        element={<CustomerMenu />} />
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* Protected admin */}
          <Route path="/admin" element={
            <ProtectedRoute>
              <AdminMenu />
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
