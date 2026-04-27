import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./screens/Home";
import Login from "./screens/Login";

import AdminMain from "./screens/admin/AdminMain";
import StaffMain from "./screens/staff/StaffMain";
import CustomerMain from "./screens/customer/CustomerMain";
import CustomerTrackingView from "./screens/customer/CustomerTrackingView";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<AdminMain />} />
        <Route path="/staff" element={<StaffMain />} />
        <Route path="/customer" element={<CustomerMain />} />
        <Route path="/tracking/:bookingId" element={<CustomerTrackingView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
