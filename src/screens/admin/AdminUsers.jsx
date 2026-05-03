import "../../styles/css/admin/adminUsersStyle.css";
import { useMemo, useState } from "react";
import FilterModal from "../../components/common/FilterModal";
import SecurityConfirmModal from "../../components/common/SecurityConfirmModal";
import ToastMessage from "../../components/common/ToastMessage";
import { useAdminData } from "../../context/AdminDataContext";

import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

const USER_TYPE_OPTIONS = ["Admin", "Staff", "Customer"];
const ROLE_OPTIONS_BY_USER_TYPE = {
  Admin: ["Owner", "Co-Owner"],
  Staff: ["Mechanic", "Inspector", "Coordinator"],
  Customer: ["New", "Returning"],
};

const EMPLOYEE_ROLE_OPTIONS = ROLE_OPTIONS_BY_USER_TYPE.Staff;

function normalizeUserType(user) {
  const normalizedUserType = String(user?.userType || "").trim().toLowerCase();
  if (["admin", "staff", "customer"].includes(normalizedUserType)) {
    return normalizedUserType;
  }

  const normalizedRole = String(user?.role || "").trim().toLowerCase();
  if (["owner", "co-owner", "admin"].includes(normalizedRole)) return "admin";
  if (["mechanic", "inspector", "coordinator", "staff"].includes(normalizedRole)) return "staff";
  return "customer";
}

function toDisplayUserType(user) {
  const normalizedUserType = normalizeUserType(user);
  return normalizedUserType.charAt(0).toUpperCase() + normalizedUserType.slice(1);
}

function toDisplayRole(userType, role) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  if (normalizedRole === "co-owner" || normalizedRole === "co owner") return "Co-Owner";
  if (!normalizedRole) return ROLE_OPTIONS_BY_USER_TYPE[userType]?.[0] || "";
  return normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1);
}

function getUserManagementRoleLabel(user) {
  const userType = toDisplayUserType(user);
  if (userType === "Customer") return "";
  return toDisplayRole(userType, user.role);
}

const createEditForm = (user) => {
  const userType = toDisplayUserType(user);
  return {
    name: user.name || "",
    userType,
    role: toDisplayRole(userType, user.role),
    email: user.email || "",
    phone: user.phone || "-",
    password: "",
    status: user.status || "active",
  };
};

const createEmployeeForm = () => ({
  name: "",
  email: "",
  phone: "",
  password: "",
  role: EMPLOYEE_ROLE_OPTIONS[0] || "Mechanic",
});

export default function AdminUsers() {
  const { users, currentUser, updateUser, deleteUser, createEmployeeAccount } = useAdminData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ userType: "", status: "" });
  const [modal, setModal] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editForm, setEditForm] = useState(() => createEditForm({}));
  const [employeeForm, setEmployeeForm] = useState(() => createEmployeeForm());
  const [securityConfirm, setSecurityConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return users.filter((user) => {
      const userType = toDisplayUserType(user);
      const role = getUserManagementRoleLabel(user);
      const matchesQuery =
        !q || `${user.name} ${userType} ${role} ${user.email} ${user.status}`.toLowerCase().includes(q);
      const matchesUserType = !filters.userType || userType === filters.userType;
      const matchesStatus = !filters.status || user.status === filters.status.toLowerCase();
      return matchesQuery && matchesUserType && matchesStatus;
    });
  }, [users, query, filters]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const currentRoleOptions = ROLE_OPTIONS_BY_USER_TYPE[editForm.userType] || [];
  const isCustomerUser = editForm.userType === "Customer";

  const closeModal = () => {
    setModal(null);
    setSelectedUser(null);
    setEmployeeForm(createEmployeeForm());
  };

  const showToast = (type, message) => {
    setToast({ type, message, id: Date.now() });
  };

  return (
    <div className="usersWrap">
      <div className="usersTopRow">
        <div className="usersSearchBox"><img className="usersSearchIcon" src={icoSearch} alt="" /><input className="usersSearchInput" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Users..." /></div>
        <button className="usersFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}><img className="usersFilterIcon" src={icoFilter} alt="" /></button>
      </div>

      <div className="usersCreateCard">
        <div>
          <div className="usersCreateTitle">Employee Accounts</div>
          <p className="usersCreateText">Create new staff accounts here for mechanics, inspectors, or coordinators.</p>
        </div>
        <button className="usersCreateBtn" type="button" onClick={() => { setEmployeeForm(createEmployeeForm()); setModal("employee"); }}>Add Employee Account</button>
      </div>

      <div className="usersBoard">
        <table className="usersTable">
          <thead><tr><th>Name</th><th>User Type</th><th>Role</th><th>Email</th><th>Phone</th><th>Status</th><th className="thCenter">Actions</th></tr></thead>
          <tbody>
            {paged.length > 0 ? paged.map((user, index) => {
              const userType = toDisplayUserType(user);
              const role = getUserManagementRoleLabel(user);
              return (
                <tr key={`${user.email}-${index}`}>
                  <td className="uName">{user.name}</td>
                  <td><span className={`rolePill role-${userType.toLowerCase()}`}>{userType}</span></td>
                  <td>{role || "—"}</td>
                  <td>{user.email}</td>
                  <td>{user.phone}</td>
                  <td><span className={user.status === "active" ? "stActive" : "stInactive"}>{user.status}</span></td>
                  <td><div className="uActions"><button className="uBtn uBtnEdit" type="button" onClick={() => { setSelectedUser(user); setEditForm(createEditForm(user)); setModal("edit"); }}>Edit</button><button className="uBtn uBtnRed" type="button" onClick={() => { setSelectedUser(user); setModal("delete"); }}>Delete</button></div></td>
                </tr>
              );
            }) : <tr><td colSpan={7} className="usersEmpty">No users found.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="usersPagerRow"><button className="usersPagerBtn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))}>{"<"}</button><span className="usersPagerNum">{safePage}</span><button className="usersPagerBtn" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{">"}</button></div>

      {modal && (
        <div className="usersModalOverlay" onClick={closeModal}>
          <div className={`usersModalCard ${modal === "delete" ? "compact" : ""}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="usersModalClose" type="button" onClick={closeModal}>x</button>

            {modal === "edit" && selectedUser && (
              <form className="usersEditForm" onSubmit={(e) => { e.preventDefault(); setSecurityConfirm({ mode: "password", title: "Update User Role", message: "Enter the admin special password before changing this account.", onConfirm: async ({ secret }) => { try { await updateUser(selectedUser.id, { ...selectedUser, ...editForm, specialPassword: secret }); setSecurityConfirm(null); showToast("success", "User account updated."); closeModal(); } catch (error) { showToast("error", error.message || "Could not update user account."); throw error; } } }); }}>
                <div className="usersModalTitle">Edit User</div>
                <div className="usersFieldGroup">
                  <label className="usersField"><span>Name</span><input value={editForm.name} onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} required /></label>
                </div>
                <div className="usersFieldGrid usersFieldGridEven">
                  <label className="usersField">
                    <span>User Type</span>
                    <select
                      value={editForm.userType}
                      onChange={(e) => {
                        const nextUserType = e.target.value;
                        setEditForm((prev) => ({
                          ...prev,
                          userType: nextUserType,
                          role: ROLE_OPTIONS_BY_USER_TYPE[nextUserType]?.[0] || "",
                        }));
                      }}
                      required
                    >
                      {USER_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="usersField">
                    <span>Role</span>
                    {isCustomerUser ? (
                      <input value="—" readOnly placeholder="Customer account" />
                    ) : (
                      <select value={editForm.role} onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))} required>
                        {currentRoleOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    )}
                  </label>
                </div>
                <div className="usersFieldGrid usersFieldGridEven">
                  <label className="usersField"><span>Status</span><select value={editForm.status} onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))} required><option value="active">Active</option><option value="Deactivated">Deactivate</option></select></label>
                  <label className="usersField"><span>Phone</span><input value={editForm.phone} onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))} /></label>
                </div>
                <div className="usersFieldGroup">
                  <label className="usersField"><span>Email</span><input type="email" value={editForm.email} onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))} required /></label>
                  <label className="usersField"><span>New Password</span><input type="password" value={editForm.password} onChange={(e) => setEditForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="Leave blank to keep current password" /></label>
                </div>
                <div className="usersModalActions"><button className="usersTextBtn" type="button" onClick={closeModal}>Cancel</button><button className="usersPrimaryBtn" type="submit">Save User</button></div>
              </form>
            )}

            {modal === "employee" && (
              <form className="usersEditForm" onSubmit={(e) => {
                e.preventDefault();
                setSecurityConfirm({
                  mode: "currentPassword",
                  title: "Create Employee Account",
                  message: "Enter your current admin account password before creating this employee account.",
                  onConfirm: async ({ secret }) => {
                    try {
                      await createEmployeeAccount({
                        ...employeeForm,
                        name: employeeForm.name.trim(),
                        email: employeeForm.email.trim(),
                        phone: employeeForm.phone.trim(),
                        password: employeeForm.password,
                        currentPassword: secret,
                      });
                      setSecurityConfirm(null);
                      showToast("success", "Employee account created.");
                      closeModal();
                    } catch (error) {
                      showToast("error", error.message || "Could not create employee account.");
                      throw error;
                    }
                  },
                });
              }}>
                <div className="usersModalTitle">Add Employee Account</div>
                <div className="usersFieldGroup">
                  <label className="usersField"><span>Full Name</span><input value={employeeForm.name} onChange={(e) => setEmployeeForm((prev) => ({ ...prev, name: e.target.value }))} required /></label>
                  <label className="usersField"><span>Email</span><input type="email" value={employeeForm.email} onChange={(e) => setEmployeeForm((prev) => ({ ...prev, email: e.target.value }))} required /></label>
                </div>
                <div className="usersFieldGrid usersFieldGridEven">
                  <label className="usersField"><span>Contact Number</span><input value={employeeForm.phone} onChange={(e) => setEmployeeForm((prev) => ({ ...prev, phone: e.target.value }))} required /></label>
                  <label className="usersField"><span>Role</span><select value={employeeForm.role} onChange={(e) => setEmployeeForm((prev) => ({ ...prev, role: e.target.value }))} required>{EMPLOYEE_ROLE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                </div>
                <div className="usersFieldGroup">
                  <label className="usersField"><span>Password</span><input type="password" value={employeeForm.password} onChange={(e) => setEmployeeForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="Minimum 8 characters" required /></label>
                </div>
                <div className="usersModalActions"><button className="usersTextBtn" type="button" onClick={closeModal}>Cancel</button><button className="usersPrimaryBtn" type="submit">Create Employee</button></div>
              </form>
            )}

            {modal === "delete" && selectedUser && (
              <div>
                <div className="usersModalTitle">Confirm Delete</div>
                <p className="usersConfirmText">Delete this user account? This action cannot be undone.</p>
                <div className="usersConfirmMeta"><div>{selectedUser.name}</div><div>{selectedUser.email}</div></div>
                <div className="usersModalActions"><button className="usersTextBtn" type="button" onClick={closeModal}>Cancel</button><button className="usersDangerBtn" type="button" onClick={() => setSecurityConfirm({ mode: "pin", title: "Delete User", message: "Enter the special PIN before deleting this account.", onConfirm: async () => { await deleteUser(selectedUser.id); setSecurityConfirm(null); showToast("success", "User account deleted."); closeModal(); } })}>Delete</button></div>
              </div>
            )}
          </div>
        </div>
      )}

      <FilterModal
        open={isFilterOpen}
        title="Filter Users"
        fields={[
          { key: "userType", label: "User Type", type: "select", options: USER_TYPE_OPTIONS },
          { key: "status", label: "Status", type: "select", options: ["Active", "Inactive"] },
        ]}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onClose={() => setIsFilterOpen(false)}
        onApply={() => { setPage(1); setIsFilterOpen(false); }}
        onReset={() => { setFilters({ userType: "", status: "" }); setPage(1); }}
      />
      <SecurityConfirmModal open={Boolean(securityConfirm)} mode={securityConfirm?.mode || "pin"} title={securityConfirm?.title} message={securityConfirm?.message} currentUser={currentUser} onClose={() => setSecurityConfirm(null)} onConfirm={securityConfirm?.onConfirm} />
      <ToastMessage toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
