import "../../styles/css/admin/adminUsersStyle.css";
import { useMemo, useState } from "react";
import FilterModal from "../../components/common/FilterModal";
import SecurityConfirmModal from "../../components/common/SecurityConfirmModal";
import ToastMessage from "../../components/common/ToastMessage";
import { useAdminData } from "../../context/AdminDataContext";
import {
  EMPLOYEE_STAFF_ROLE_OPTIONS,
  STAFF_ROLE_OPTIONS,
  getStaffRoleLabel,
  isValidStaffRole,
  normalizeStaffRole,
} from "../../utils/staffRoles";
import { ACTION_KEYS, canPerformAction } from "../../utils/rbac";

import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

const USER_TYPE_OPTIONS = ["Admin", "Staff"];
const ROLE_OPTIONS_BY_USER_TYPE = {
  Admin: ["Admin"],
  Staff: EMPLOYEE_STAFF_ROLE_OPTIONS,
  Customer: ["New", "Returning"],
};

const EMPLOYEE_ROLE_OPTIONS = EMPLOYEE_STAFF_ROLE_OPTIONS;
const EMPLOYEE_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_REGEX = /^09\d{9}$/;
const EDIT_FIELD_IDS = {
  name: "edit-user-name",
  userType: "edit-user-type",
  role: "edit-user-role",
  status: "edit-user-status",
  phone: "edit-user-phone",
  email: "edit-user-email",
  password: "edit-user-password",
};
const EDIT_ERROR_IDS = {
  name: "edit-user-name-error",
  userType: "edit-user-type-error",
  role: "edit-user-role-error",
  status: "edit-user-status-error",
  phone: "edit-user-phone-error",
  email: "edit-user-email-error",
  password: "edit-user-password-error",
};
const EDIT_FIELDS = Object.keys(EDIT_FIELD_IDS);
const EMPLOYEE_FIELD_IDS = {
  name: "employee-full-name",
  email: "employee-email",
  phone: "employee-phone",
  role: "employee-role",
  password: "employee-password",
};
const EMPLOYEE_ERROR_IDS = {
  name: "employee-full-name-error",
  email: "employee-email-error",
  phone: "employee-phone-error",
  role: "employee-role-error",
  password: "employee-password-error",
};
const EMPLOYEE_FIELDS = Object.keys(EMPLOYEE_FIELD_IDS);

function sanitizeEmployeeNameInput(value) {
  return String(value || "")
    .replace(/[^\p{L}\s'.-]/gu, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 48);
}

function normalizeEmployeeName(value) {
  return sanitizeEmployeeNameInput(value).trim().replace(/\s+/g, " ");
}

function normalizeEditName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";
  return rawValue.replace(/\D/g, "").slice(0, 11);
}

function getPasswordChecks(password) {
  const value = String(password || "");
  return [
    { key: "length", label: "At least 8 characters", met: value.length >= 8 },
    { key: "uppercase", label: "At least 1 uppercase letter", met: /[A-Z]/.test(value) },
    { key: "lowercase", label: "At least 1 lowercase letter", met: /[a-z]/.test(value) },
    { key: "number", label: "At least 1 number", met: /\d/.test(value) },
    { key: "special", label: "At least 1 special character", met: /[^A-Za-z0-9]/.test(value) },
  ];
}

function validateEmployeeForm(form) {
  const name = normalizeEmployeeName(form.name);
  const email = normalizeEmail(form.email);
  const phone = normalizePhone(form.phone);
  const role = String(form.role || "").trim();
  const password = String(form.password || "");
  const passwordChecks = getPasswordChecks(password);
  const errors = {};

  if (!name) errors.name = "Full name is required.";
  else if (name.length > 48) errors.name = "Full name must be 48 characters or less.";
  else if (!/^[\p{L}\s'.-]+$/u.test(name)) errors.name = "Full name can only contain letters, spaces, hyphens, apostrophes, and periods.";
  if (!email) errors.email = "Email is required.";
  else if (!EMPLOYEE_EMAIL_REGEX.test(email)) errors.email = "Please enter a valid email address.";
  if (!phone) errors.phone = "Contact number is required.";
  else if (!/^09\d{9}$/.test(phone)) errors.phone = "Contact number must be 11 digits and start with 09.";
  if (!EMPLOYEE_ROLE_OPTIONS.includes(role)) errors.role = "Select a valid staff role. Admin cannot be created from this form.";
  if (!password) errors.password = "Password is required.";
  const failedPasswordCheck = passwordChecks.find((check) => !check.met);
  if (!errors.password && failedPasswordCheck) errors.password = failedPasswordCheck.label + ".";

  return { errors, isValid: Object.keys(errors).length === 0, payload: { name, email, phone, role, password } };
}

function getUserKey(user = {}) {
  if (!user) return "";
  return String(user.id || user._id || user.email || "").trim().toLowerCase();
}

function validateEditUserForm(form, selectedUser, users = []) {
  const name = normalizeEditName(form.name);
  const email = normalizeEmail(form.email);
  const phone = normalizePhone(form.phone);
  const userType = String(form.userType || "").trim();
  const role = String(form.role || "").trim();
  const status = String(form.status || "").trim().toLowerCase();
  const password = String(form.password || "");
  const errors = {};
  const selectedKey = getUserKey(selectedUser);

  if (!name) errors.name = "Full name is required.";
  if (!USER_TYPE_OPTIONS.includes(userType)) errors.userType = "Select a valid user type.";
  if (userType === "Admin" && role !== "Admin") errors.role = "Admin accounts must use the Admin role.";
  if (userType === "Staff" && !EMPLOYEE_ROLE_OPTIONS.includes(role)) errors.role = "Select a valid staff role. Admin cannot be created from this form.";
  if (!["active", "deactivated", "inactive"].includes(status)) errors.status = "Select a valid account status.";
  if (!email) errors.email = "Email is required.";
  else if (!EMPLOYEE_EMAIL_REGEX.test(email)) errors.email = "Please enter a valid email address.";
  if (phone && !PHONE_REGEX.test(phone)) errors.phone = "Please enter a valid phone number.";

  const duplicateEmail = users.find((user) =>
    getUserKey(user) !== selectedKey &&
    normalizeEmail(user.email) === email
  );
  if (!errors.email && duplicateEmail) errors.email = "That email is already registered.";

  const duplicatePhone = phone && users.find((user) =>
    getUserKey(user) !== selectedKey &&
    normalizePhone(user.phone) === phone
  );
  if (!errors.phone && duplicatePhone) errors.phone = "That contact number is already registered.";

  if (password.trim()) {
    const failedPasswordCheck = getPasswordChecks(password).find((check) => !check.met);
    if (failedPasswordCheck) errors.password = failedPasswordCheck.label + ".";
  }

  const payload = {
    name,
    userType,
    role,
    email,
    phone,
    status: status === "active" ? "active" : "deactivated",
  };
  if (password.trim()) payload.password = password;

  return { errors, isValid: Object.keys(errors).length === 0, payload };
}

function normalizeUserType(user) {
  const normalizedUserType = String(user?.userType || "").trim().toLowerCase();
  if (["admin", "staff", "customer"].includes(normalizedUserType)) {
    return normalizedUserType;
  }

  const normalizedRole = normalizeStaffRole(user?.role);
  if (["owner", "co-owner", "admin"].includes(normalizedRole)) return "admin";
  if (
    ["mechanic", "inspector", "coordinator", "staff", "detailer", "technician", "employee", "manager", "senior staff", "junior staff"].includes(normalizedRole) ||
    (isValidStaffRole(normalizedRole) && normalizedRole !== "admin")
  ) {
    return "staff";
  }
  return "customer";
}

function toDisplayUserType(user) {
  const normalizedUserType = normalizeUserType(user);
  return normalizedUserType.charAt(0).toUpperCase() + normalizedUserType.slice(1);
}

function toDisplayRole(userType, role) {
  const normalizedRole = normalizeStaffRole(role);
  if (!normalizedRole) return ROLE_OPTIONS_BY_USER_TYPE[userType]?.[0] || "";
  if (userType === "Admin" || userType === "Staff") return getStaffRoleLabel(role);
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
    phone: user.phone || "",
    password: "",
    status: user.status || "active",
  };
};

const createEmployeeForm = () => ({
  name: "",
  email: "",
  phone: "",
  password: "",
  role: EMPLOYEE_ROLE_OPTIONS[0] || "Junior Detailer",
});

export default function AdminUsers() {
  const { users, currentUser, updateUser, deleteUser, createEmployeeAccount } = useAdminData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ userType: "", role: "", status: "" });
  const [modal, setModal] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editForm, setEditForm] = useState(() => createEditForm({}));
  const [editTouched, setEditTouched] = useState({});
  const [editSubmitted, setEditSubmitted] = useState(false);
  const [editServerErrors, setEditServerErrors] = useState({});
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [employeeForm, setEmployeeForm] = useState(() => createEmployeeForm());
  const [employeeTouched, setEmployeeTouched] = useState({});
  const [employeeSubmitted, setEmployeeSubmitted] = useState(false);
  const [employeeServerErrors, setEmployeeServerErrors] = useState({});
  const [employeeSubmitting, setEmployeeSubmitting] = useState(false);
  const [securityConfirm, setSecurityConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const canManageStaff = canPerformAction(currentUser, ACTION_KEYS.usersManageStaff);
  const canDeleteStaff = canPerformAction(currentUser, ACTION_KEYS.usersDelete);
  const editValidation = useMemo(() => validateEditUserForm(editForm, selectedUser, users), [editForm, selectedUser, users]);
  const editSaveDisabled = !editValidation.isValid || editSubmitting;
  const employeeValidation = useMemo(() => validateEmployeeForm(employeeForm), [employeeForm]);
  const employeeCreateDisabled = !employeeValidation.isValid || employeeSubmitting;

  const manageableUsers = useMemo(
    () => users.filter((user) => {
      const userType = normalizeUserType(user);
      return userType === "admin" || userType === "staff";
    }),
    [users]
  );

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return manageableUsers.filter((user) => {
      const userType = toDisplayUserType(user);
      const role = getUserManagementRoleLabel(user);
      const matchesQuery =
        !q || `${user.name} ${userType} ${role} ${user.email} ${user.status}`.toLowerCase().includes(q);
      const matchesUserType = !filters.userType || userType === filters.userType;
      const matchesRole = !filters.role || role === filters.role;
      const matchesStatus = !filters.status || user.status === filters.status.toLowerCase();
      return matchesQuery && matchesUserType && matchesRole && matchesStatus;
    });
  }, [manageableUsers, query, filters]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const currentRoleOptions = useMemo(() => {
    const base = ROLE_OPTIONS_BY_USER_TYPE[editForm.userType] || [];
    return editForm.role && !base.includes(editForm.role) ? [editForm.role, ...base] : base;
  }, [editForm.role, editForm.userType]);
  const isCustomerUser = editForm.userType === "Customer";

  const closeModal = () => {
    setModal(null);
    setSelectedUser(null);
    setEditForm(createEditForm({}));
    setEditTouched({});
    setEditSubmitted(false);
    setEditServerErrors({});
    setEditSubmitting(false);
    setEmployeeForm(createEmployeeForm());
    setEmployeeTouched({});
    setEmployeeSubmitted(false);
    setEmployeeServerErrors({});
    setEmployeeSubmitting(false);
  };

  const showToast = (type, message) => {
    setToast({ type, message, id: Date.now() });
  };

  const openEmployeeModal = () => {
    setEmployeeForm(createEmployeeForm());
    setEmployeeTouched({});
    setEmployeeSubmitted(false);
    setEmployeeServerErrors({});
    setEmployeeSubmitting(false);
    setModal("employee");
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setEditForm(createEditForm(user));
    setEditTouched({});
    setEditSubmitted(false);
    setEditServerErrors({});
    setEditSubmitting(false);
    setModal("edit");
  };

  const touchEditField = (field) => {
    setEditTouched((prev) => ({ ...prev, [field]: true }));
  };

  const clearEditServerError = (field) => {
    setEditServerErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const getEditError = (field) => (
    editSubmitted || editTouched[field]
      ? editValidation.errors[field] || editServerErrors[field] || ""
      : editServerErrors[field] || ""
  );

  const markAllEditFieldsTouched = () => {
    setEditSubmitted(true);
    setEditTouched(EDIT_FIELDS.reduce((next, field) => ({ ...next, [field]: true }), {}));
  };

  const setEditBackendError = (error) => {
    const message = error.message || "Could not update user account.";
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes("email")) {
      setEditServerErrors({ email: message });
    } else if (lowerMessage.includes("contact") || lowerMessage.includes("phone")) {
      setEditServerErrors({ phone: message });
    } else if (lowerMessage.includes("role")) {
      setEditServerErrors({ role: message });
    } else if (lowerMessage.includes("status") || lowerMessage.includes("active") || lowerMessage.includes("deactivate")) {
      setEditServerErrors({ status: message });
    } else if (lowerMessage.includes("password")) {
      setEditServerErrors({ password: message });
    } else if (lowerMessage.includes("name")) {
      setEditServerErrors({ name: message });
    } else {
      setEditServerErrors({ form: message });
    }
  };

  const touchEmployeeField = (field) => {
    setEmployeeTouched((prev) => ({ ...prev, [field]: true }));
  };

  const clearEmployeeServerError = (field) => {
    setEmployeeServerErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const getEmployeeError = (field) => (
    employeeSubmitted || employeeTouched[field]
      ? employeeValidation.errors[field] || employeeServerErrors[field] || ""
      : employeeServerErrors[field] || ""
  );

  const markAllEmployeeFieldsTouched = () => {
    setEmployeeSubmitted(true);
    setEmployeeTouched(EMPLOYEE_FIELDS.reduce((next, field) => ({ ...next, [field]: true }), {}));
  };

  const setEmployeeBackendError = (error) => {
    const message = error.message || "Could not create employee account.";
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes("email")) {
      setEmployeeServerErrors({ email: message });
    } else if (lowerMessage.includes("contact") || lowerMessage.includes("phone")) {
      setEmployeeServerErrors({ phone: message });
    } else if (lowerMessage.includes("role")) {
      setEmployeeServerErrors({ role: message });
    } else if (lowerMessage.includes("password")) {
      setEmployeeServerErrors({ password: message });
    } else {
      setEmployeeServerErrors({ form: message });
    }
  };

  return (
    <div className="usersWrap">
      <div className="usersTopRow">
        <div className="usersSearchBox"><img className="usersSearchIcon" src={icoSearch} alt="" /><input className="usersSearchInput" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Users..." /></div>
        <button className="usersFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}><img className="usersFilterIcon" src={icoFilter} alt="" /></button>
      </div>

      {canManageStaff && (
        <div className="usersCreateCard">
          <div>
            <div className="usersCreateTitle">Employee Accounts</div>
            <p className="usersCreateText">Create new staff accounts here for managers, associates, clerks, detailers, and marketing staff.</p>
          </div>
          <button className="usersCreateBtn" type="button" onClick={openEmployeeModal}>Add Employee Account</button>
        </div>
      )}

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
                  <td><div className="uActions">{canManageStaff ? <button className="uBtn uBtnEdit" type="button" onClick={() => openEditModal(user)}>Edit</button> : <span className="usersEmpty">View only</span>}{canDeleteStaff && <button className="uBtn uBtnRed" type="button" onClick={() => { setSelectedUser(user); setModal("delete"); }}>Delete</button>}</div></td>
                </tr>
              );
            }) : <tr><td colSpan={7} className="usersEmpty">No users found.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="usersPagerRow"><button className="usersPagerBtn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))}>{"<"}</button><span className="usersPagerNum">{safePage}</span><button className="usersPagerBtn" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{">"}</button></div>

      {modal && (
        <div className="usersModalOverlay" onClick={closeModal}>
          <div className={`usersModalCard ${modal === "delete" ? "compact" : ""}`} role="dialog" aria-modal="true" aria-label={modal === "employee" ? "Add Employee Account" : modal === "edit" ? "Edit User" : "Confirm Delete"} onClick={(e) => e.stopPropagation()}>
            <button className="usersModalClose" type="button" onClick={closeModal}>x</button>

            {modal === "edit" && selectedUser && (
              <form className="usersEditForm" noValidate onSubmit={(e) => {
                e.preventDefault();
                const validation = validateEditUserForm(editForm, selectedUser, users);
                setEditServerErrors({});
                if (!validation.isValid) {
                  markAllEditFieldsTouched();
                  showToast("error", Object.values(validation.errors)[0] || "Please complete the required fields.");
                  return;
                }
                setEditSubmitted(false);
                setSecurityConfirm({
                  mode: "password",
                  title: "Update User",
                  message: "Enter the admin special password before changing this account.",
                  onConfirm: async ({ secret }) => {
                    if (editSubmitting) return;
                    try {
                      setEditSubmitting(true);
                      await updateUser(selectedUser.id, { id: selectedUser.id, ...validation.payload, specialPassword: secret });
                      setSecurityConfirm(null);
                      showToast("success", "User account updated.");
                      closeModal();
                    } catch (error) {
                      setEditSubmitting(false);
                      setEditBackendError(error);
                      showToast("error", error.message || "Could not update user account.");
                      throw error;
                    }
                  },
                });
              }}>
                <div className="usersModalTitle">Edit User</div>
                <div className="usersFieldGroup">
                  <label className="usersField" htmlFor={EDIT_FIELD_IDS.name}>
                    <span>Name</span>
                    <input
                      id={EDIT_FIELD_IDS.name}
                      value={editForm.name}
                      onBlur={() => touchEditField("name")}
                      onChange={(e) => {
                        clearEditServerError("name");
                        setEditForm((prev) => ({ ...prev, name: e.target.value }));
                      }}
                      required
                      aria-required="true"
                      aria-invalid={getEditError("name") ? "true" : undefined}
                      aria-describedby={getEditError("name") ? EDIT_ERROR_IDS.name : undefined}
                    />
                    {getEditError("name") ? <div className="usersFieldError" id={EDIT_ERROR_IDS.name}>{getEditError("name")}</div> : null}
                  </label>
                </div>
                <div className="usersFieldGrid usersFieldGridEven">
                  <label className="usersField" htmlFor={EDIT_FIELD_IDS.userType}>
                    <span>User Type</span>
                    <select
                      id={EDIT_FIELD_IDS.userType}
                      value={editForm.userType}
                      onBlur={() => touchEditField("userType")}
                      onChange={(e) => {
                        const nextUserType = e.target.value;
                        clearEditServerError("userType");
                        clearEditServerError("role");
                        setEditForm((prev) => ({
                          ...prev,
                          userType: nextUserType,
                          role: ROLE_OPTIONS_BY_USER_TYPE[nextUserType]?.[0] || "",
                        }));
                      }}
                      required
                      aria-required="true"
                      aria-invalid={getEditError("userType") ? "true" : undefined}
                      aria-describedby={getEditError("userType") ? EDIT_ERROR_IDS.userType : undefined}
                    >
                      {USER_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    {getEditError("userType") ? <div className="usersFieldError" id={EDIT_ERROR_IDS.userType}>{getEditError("userType")}</div> : null}
                  </label>
                  <label className="usersField" htmlFor={EDIT_FIELD_IDS.role}>
                    <span>Role</span>
                    {isCustomerUser ? (
                      <input id={EDIT_FIELD_IDS.role} value="—" readOnly placeholder="Customer account" />
                    ) : (
                      <select
                        id={EDIT_FIELD_IDS.role}
                        value={editForm.role}
                        onBlur={() => touchEditField("role")}
                        onChange={(e) => {
                          clearEditServerError("role");
                          setEditForm((prev) => ({ ...prev, role: e.target.value }));
                        }}
                        required
                        aria-required="true"
                        aria-invalid={getEditError("role") ? "true" : undefined}
                        aria-describedby={getEditError("role") ? EDIT_ERROR_IDS.role : undefined}
                      >
                        {currentRoleOptions.map((option) => <option key={option} value={option} disabled={!isValidStaffRole(option)}>{option}</option>)}
                      </select>
                    )}
                    {getEditError("role") ? <div className="usersFieldError" id={EDIT_ERROR_IDS.role}>{getEditError("role")}</div> : null}
                  </label>
                </div>
                <div className="usersFieldGrid usersFieldGridEven">
                  <label className="usersField" htmlFor={EDIT_FIELD_IDS.status}>
                    <span>Status</span>
                    <select
                      id={EDIT_FIELD_IDS.status}
                      value={editForm.status}
                      onBlur={() => touchEditField("status")}
                      onChange={(e) => {
                        clearEditServerError("status");
                        setEditForm((prev) => ({ ...prev, status: e.target.value }));
                      }}
                      required
                      aria-required="true"
                      aria-invalid={getEditError("status") ? "true" : undefined}
                      aria-describedby={getEditError("status") ? EDIT_ERROR_IDS.status : undefined}
                    >
                      <option value="active">Active</option>
                      <option value="deactivated">Inactive</option>
                    </select>
                    {getEditError("status") ? <div className="usersFieldError" id={EDIT_ERROR_IDS.status}>{getEditError("status")}</div> : null}
                  </label>
                  <label className="usersField" htmlFor={EDIT_FIELD_IDS.phone}>
                    <span>Phone</span>
                    <input
                      id={EDIT_FIELD_IDS.phone}
                      value={editForm.phone}
                      inputMode="numeric"
                      maxLength={11}
                      onBlur={() => touchEditField("phone")}
                      onChange={(e) => {
                        clearEditServerError("phone");
                        setEditForm((prev) => ({ ...prev, phone: e.target.value.replace(/\D/g, "").slice(0, 11) }));
                      }}
                      aria-invalid={getEditError("phone") ? "true" : undefined}
                      aria-describedby={getEditError("phone") ? EDIT_ERROR_IDS.phone : undefined}
                    />
                    {getEditError("phone") ? <div className="usersFieldError" id={EDIT_ERROR_IDS.phone}>{getEditError("phone")}</div> : null}
                  </label>
                </div>
                <div className="usersFieldGroup">
                  <label className="usersField" htmlFor={EDIT_FIELD_IDS.email}>
                    <span>Email</span>
                    <input
                      id={EDIT_FIELD_IDS.email}
                      type="email"
                      value={editForm.email}
                      onBlur={() => touchEditField("email")}
                      onChange={(e) => {
                        clearEditServerError("email");
                        setEditForm((prev) => ({ ...prev, email: e.target.value.trim().toLowerCase() }));
                      }}
                      required
                      aria-required="true"
                      aria-invalid={getEditError("email") ? "true" : undefined}
                      aria-describedby={getEditError("email") ? EDIT_ERROR_IDS.email : undefined}
                    />
                    {getEditError("email") ? <div className="usersFieldError" id={EDIT_ERROR_IDS.email}>{getEditError("email")}</div> : null}
                  </label>
                  <label className="usersField" htmlFor={EDIT_FIELD_IDS.password}>
                    <span>New Password</span>
                    <input
                      id={EDIT_FIELD_IDS.password}
                      type="password"
                      value={editForm.password}
                      onBlur={() => touchEditField("password")}
                      onChange={(e) => {
                        clearEditServerError("password");
                        setEditForm((prev) => ({ ...prev, password: e.target.value }));
                      }}
                      placeholder="Leave blank to keep current password"
                      aria-invalid={getEditError("password") ? "true" : undefined}
                      aria-describedby={getEditError("password") ? EDIT_ERROR_IDS.password : undefined}
                    />
                    {getEditError("password") ? <div className="usersFieldError" id={EDIT_ERROR_IDS.password}>{getEditError("password")}</div> : null}
                  </label>
                </div>
                {editServerErrors.form ? <div className="usersFieldError">{editServerErrors.form}</div> : null}
                <div className="usersModalActions"><button className="usersTextBtn" type="button" onClick={closeModal} disabled={editSubmitting}>Cancel</button><button className="usersPrimaryBtn" type="submit" disabled={editSaveDisabled}>{editSubmitting ? "Saving..." : "Save User"}</button></div>
              </form>
            )}

            {modal === "employee" && (
              <form className="usersEditForm" noValidate onSubmit={(e) => {
                e.preventDefault();
                const validation = validateEmployeeForm(employeeForm);
                setEmployeeServerErrors({});
                if (!validation.isValid) {
                  markAllEmployeeFieldsTouched();
                  showToast("error", Object.values(validation.errors)[0] || "Please complete the required fields.");
                  return;
                }
                setEmployeeSubmitted(false);
                setSecurityConfirm({
                  mode: "currentPassword",
                  title: "Create Employee Account",
                  message: "Enter your current admin account password before creating this employee account.",
                  onConfirm: async ({ secret }) => {
                    if (employeeSubmitting) return;
                    try {
                      setEmployeeSubmitting(true);
                      await createEmployeeAccount({
                        ...validation.payload,
                        currentPassword: secret,
                      });
                      setSecurityConfirm(null);
                      showToast("success", "Employee account created.");
                      closeModal();
                    } catch (error) {
                      setEmployeeSubmitting(false);
                      setEmployeeBackendError(error);
                      showToast("error", error.message || "Could not create employee account.");
                      throw error;
                    }
                  },
                });
              }}>
                <div className="usersModalTitle">Add Employee Account</div>
                <div className="usersFieldGroup">
                  <label className="usersField" htmlFor={EMPLOYEE_FIELD_IDS.name}>
                    <span>Full Name</span>
                    <input
                      id={EMPLOYEE_FIELD_IDS.name}
                      maxLength={48}
                      value={employeeForm.name}
                      onBlur={() => touchEmployeeField("name")}
                      onChange={(e) => {
                        clearEmployeeServerError("name");
                        setEmployeeForm((prev) => ({ ...prev, name: sanitizeEmployeeNameInput(e.target.value) }));
                      }}
                      required
                      aria-required="true"
                      aria-invalid={getEmployeeError("name") ? "true" : undefined}
                      aria-describedby={getEmployeeError("name") ? EMPLOYEE_ERROR_IDS.name : undefined}
                    />
                    {getEmployeeError("name") ? <div className="usersFieldError" id={EMPLOYEE_ERROR_IDS.name}>{getEmployeeError("name")}</div> : null}
                  </label>
                  <label className="usersField" htmlFor={EMPLOYEE_FIELD_IDS.email}>
                    <span>Email</span>
                    <input
                      id={EMPLOYEE_FIELD_IDS.email}
                      type="email"
                      value={employeeForm.email}
                      onBlur={() => touchEmployeeField("email")}
                      onChange={(e) => {
                        clearEmployeeServerError("email");
                        setEmployeeForm((prev) => ({ ...prev, email: e.target.value.trim().toLowerCase() }));
                      }}
                      required
                      aria-required="true"
                      aria-invalid={getEmployeeError("email") ? "true" : undefined}
                      aria-describedby={getEmployeeError("email") ? EMPLOYEE_ERROR_IDS.email : undefined}
                    />
                    {getEmployeeError("email") ? <div className="usersFieldError" id={EMPLOYEE_ERROR_IDS.email}>{getEmployeeError("email")}</div> : null}
                  </label>
                </div>
                <div className="usersFieldGrid usersFieldGridEven">
                  <label className="usersField" htmlFor={EMPLOYEE_FIELD_IDS.phone}>
                    <span>Contact Number</span>
                    <input
                      id={EMPLOYEE_FIELD_IDS.phone}
                      inputMode="numeric"
                      maxLength={11}
                      value={employeeForm.phone}
                      onBlur={() => touchEmployeeField("phone")}
                      onChange={(e) => {
                        clearEmployeeServerError("phone");
                        setEmployeeForm((prev) => ({ ...prev, phone: e.target.value.replace(/\D/g, "").slice(0, 11) }));
                      }}
                      required
                      aria-required="true"
                      aria-invalid={getEmployeeError("phone") ? "true" : undefined}
                      aria-describedby={getEmployeeError("phone") ? EMPLOYEE_ERROR_IDS.phone : undefined}
                    />
                    {getEmployeeError("phone") ? <div className="usersFieldError" id={EMPLOYEE_ERROR_IDS.phone}>{getEmployeeError("phone")}</div> : null}
                  </label>
                  <label className="usersField" htmlFor={EMPLOYEE_FIELD_IDS.role}>
                    <span>Role</span>
                    <select
                      id={EMPLOYEE_FIELD_IDS.role}
                      value={employeeForm.role}
                      onBlur={() => touchEmployeeField("role")}
                      onChange={(e) => {
                        clearEmployeeServerError("role");
                        setEmployeeForm((prev) => ({ ...prev, role: e.target.value }));
                      }}
                      required
                      aria-required="true"
                      aria-invalid={getEmployeeError("role") ? "true" : undefined}
                      aria-describedby={getEmployeeError("role") ? EMPLOYEE_ERROR_IDS.role : undefined}
                    >
                      {EMPLOYEE_ROLE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    {getEmployeeError("role") ? <div className="usersFieldError" id={EMPLOYEE_ERROR_IDS.role}>{getEmployeeError("role")}</div> : null}
                  </label>
                </div>
                <div className="usersFieldGroup">
                  <label className="usersField" htmlFor={EMPLOYEE_FIELD_IDS.password}>
                    <span>Password</span>
                    <input
                      id={EMPLOYEE_FIELD_IDS.password}
                      type="password"
                      value={employeeForm.password}
                      onBlur={() => touchEmployeeField("password")}
                      onChange={(e) => {
                        clearEmployeeServerError("password");
                        setEmployeeForm((prev) => ({ ...prev, password: e.target.value }));
                      }}
                      placeholder="Minimum 8 characters"
                      required
                      aria-required="true"
                      aria-invalid={getEmployeeError("password") ? "true" : undefined}
                      aria-describedby={getEmployeeError("password") ? EMPLOYEE_ERROR_IDS.password : undefined}
                    />
                    {getEmployeeError("password") ? <div className="usersFieldError" id={EMPLOYEE_ERROR_IDS.password}>{getEmployeeError("password")}</div> : null}
                  </label>
                </div>
                <div className="usersPasswordChecklist">
                  {getPasswordChecks(employeeForm.password).map((check) => (
                    <span key={check.key} className={check.met ? "met" : ""}>{check.label}</span>
                  ))}
                </div>
                {employeeServerErrors.form ? <div className="usersFieldError">{employeeServerErrors.form}</div> : null}
                <div className="usersModalActions"><button className="usersTextBtn" type="button" onClick={closeModal} disabled={employeeSubmitting}>Cancel</button><button className="usersPrimaryBtn" type="submit" disabled={employeeCreateDisabled}>{employeeSubmitting ? "Creating..." : "Create Employee"}</button></div>
              </form>
            )}

            {modal === "delete" && selectedUser && (
              <div>
                <div className="usersModalTitle">Confirm Delete</div>
                <p className="usersConfirmText">Delete this user account? This action cannot be undone.</p>
                <div className="usersConfirmMeta"><div>{selectedUser.name}</div><div>{selectedUser.email}</div></div>
                <div className="usersModalActions"><button className="usersTextBtn" type="button" onClick={closeModal}>Cancel</button><button className="usersDangerBtn" type="button" onClick={() => setSecurityConfirm({ mode: "password", title: "Delete User", message: "Enter the admin special password before deleting this account.", onConfirm: async ({ secret }) => { await deleteUser(selectedUser.id, { specialPassword: secret }); setSecurityConfirm(null); showToast("success", "User account deleted."); closeModal(); } })}>Delete</button></div>
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
          { key: "role", label: "Role", type: "select", options: STAFF_ROLE_OPTIONS },
          { key: "status", label: "Status", type: "select", options: ["Active", "Inactive"] },
        ]}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onClose={() => setIsFilterOpen(false)}
        onApply={() => { setPage(1); setIsFilterOpen(false); }}
        onReset={() => { setFilters({ userType: "", role: "", status: "" }); setPage(1); }}
      />
      <SecurityConfirmModal open={Boolean(securityConfirm)} mode={securityConfirm?.mode || "pin"} title={securityConfirm?.title} message={securityConfirm?.message} currentUser={currentUser} onClose={() => setSecurityConfirm(null)} actionKey={securityConfirm?.actionKey}
        onConfirm={securityConfirm?.onConfirm} />
      <ToastMessage toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
