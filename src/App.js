import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { AuthSessionManager, ProtectedRoute, PublicRoute } from "./components/AuthRoutes";

import Home from "./screens/Home";
import Login from "./screens/Login";

import AdminMain from "./screens/admin/AdminMain";
import StaffMain from "./screens/staff/StaffMain";
import CustomerMain from "./screens/customer/CustomerMain";
import CustomerTrackingView from "./screens/customer/CustomerTrackingView";
import CustomerWarrantyView from "./screens/customer/CustomerWarrantyView";

function App() {
  return (
    <BrowserRouter>
      <AuthSessionManager />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}><AdminMain /></ProtectedRoute>} />
        <Route path="/staff" element={<ProtectedRoute allowedRoles={["staff"]}><StaffMain /></ProtectedRoute>} />
        <Route path="/client" element={<ProtectedRoute allowedRoles={["customer"]}><CustomerMain /></ProtectedRoute>} />
        <Route path="/customer" element={<ProtectedRoute allowedRoles={["customer"]}><Navigate to="/client" replace /></ProtectedRoute>} />
        <Route path="/tracking/:bookingId/warranty" element={<CustomerWarrantyView />} />
        <Route path="/tracking/:bookingId" element={<CustomerTrackingView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
