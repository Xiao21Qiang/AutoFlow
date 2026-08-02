import "../../styles/css/admin/adminEngagementStyle.css";
import { useMemo, useRef, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import { buildReportDownloadPath, downloadAuthenticatedFile } from "../../utils/downloadExport";
import SecurityConfirmModal from "../../components/common/SecurityConfirmModal";
import { getRewardStatus } from "../../utils/rewards";
import { ACTION_KEYS } from "../../utils/rbac";
import {
  REWARD_UI_CATEGORIES,
  canonicalRewardTypeToUiCategory,
  getRewardTypeSearchText,
  uiCategoryToCanonicalRewardType,
} from "../../utils/rewardTypes";

const PROMO_FORM_FIELDS = [
  "title",
  "code",
  "discountValue",
  "maxUsagePerUser",
  "expiresAt",
  "usageLimit",
  "message",
];
const REWARD_FORM_FIELDS = ["name", "type", "description", "value", "stock", "expirationDays", "weight", "rarity"];
const REWARD_RARITIES = ["Common", "Uncommon", "Rare"];

function isBlank(value) {
  return String(value || "").trim() === "";
}

function parseFiniteInput(value) {
  if (isBlank(value)) return NaN;
  return Number(String(value).trim());
}

function parseRewardNumericValueInput(value) {
  if (isBlank(value)) return NaN;
  const match = String(value).replace(/,/g, "").trim().match(/(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : NaN;
}

function validatePromoForm(form) {
  const errors = {};
  const title = String(form.title || "").trim();
  const code = String(form.code || "").trim();
  const discountType = String(form.discountType || "").trim();
  const discountValue = parseFiniteInput(form.discountValue);
  const maxUsagePerUser = parseFiniteInput(form.maxUsagePerUser);
  const expiryMode = String(form.expiryMode || "none").trim().toLowerCase();

  if (!title) errors.title = "Promo title is required.";
  if (!code) errors.code = "Promo code is required.";

  if (isBlank(form.discountValue)) {
    errors.discountValue = "Discount value is required.";
  } else if (!Number.isFinite(discountValue) || discountValue <= 0) {
    errors.discountValue = "Discount value must be greater than zero.";
  } else if (discountType === "Percentage" && discountValue > 100) {
    errors.discountValue = "Percentage discount cannot exceed 100%.";
  }

  if (isBlank(form.maxUsagePerUser)) {
    errors.maxUsagePerUser = "Max usage per user is required.";
  } else if (!Number.isFinite(maxUsagePerUser) || maxUsagePerUser <= 0 || !Number.isInteger(maxUsagePerUser)) {
    errors.maxUsagePerUser = "Max usage per user must be a positive whole number.";
  }

  if (expiryMode === "date" && isBlank(form.expiresAt)) {
    errors.expiresAt = "Expiry date is required.";
  }
  if (expiryMode === "usage") {
    const usageLimit = parseFiniteInput(form.usageLimit);
    if (isBlank(form.usageLimit) || !Number.isFinite(usageLimit) || usageLimit <= 0) {
      errors.usageLimit = "Usage limit must be greater than zero.";
    }
  }

  return errors;
}

function markAllPromoFieldsTouched() {
  return PROMO_FORM_FIELDS.reduce((touched, field) => ({ ...touched, [field]: true }), {});
}

function isPositiveWholeNumber(value) {
  const numeric = parseFiniteInput(value);
  return Number.isFinite(numeric) && numeric > 0 && Number.isInteger(numeric);
}

function validateRewardForm(form) {
  const errors = {};
  const name = String(form.name || "").trim();
  const type = String(form.type || "").trim();
  const description = String(form.description || "").trim();
  const value = String(form.value || "").trim();
  const weight = parseFiniteInput(form.weight);
  const numericValue = parseRewardNumericValueInput(form.value);
  const canonicalType = uiCategoryToCanonicalRewardType(type, {
    previousCanonicalType: form.originalType,
  });

  if (!name) errors.name = "Reward name is required.";
  if (!type) {
    errors.type = "Reward type is required.";
  } else if (!REWARD_UI_CATEGORIES.includes(type)) {
    errors.type = "Reward type is invalid.";
  }
  if (!description) errors.description = "Reward description is required.";

  if (!value) {
    errors.value = "Reward value is required.";
  } else if (type === "Discount") {
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      errors.value = "Reward value must be greater than zero.";
    } else if (canonicalType !== "Fixed Discount" && numericValue > 100) {
      errors.value = "Percentage reward value cannot exceed 100%.";
    }
  }

  if (isBlank(form.stock)) {
    errors.stock = "Reward stock is required.";
  } else if (!isPositiveWholeNumber(form.stock)) {
    errors.stock = "Reward stock must be a positive whole number.";
  }

  if (isBlank(form.expirationDays)) {
    errors.expirationDays = "Expiration days are required.";
  } else if (!isPositiveWholeNumber(form.expirationDays)) {
    errors.expirationDays = "Expiration days must be a positive whole number.";
  }

  if (!Number.isFinite(weight) || weight <= 0) {
    errors.weight = "Reward weight must be greater than zero.";
  }
  if (!REWARD_RARITIES.includes(String(form.rarity || "").trim())) {
    errors.rarity = "Reward rarity is invalid.";
  }

  return errors;
}

function markAllRewardFieldsTouched() {
  return REWARD_FORM_FIELDS.reduce((touched, field) => ({ ...touched, [field]: true }), {});
}

export default function AdminEngagement() {
  const { reviews, promos, rewards, customerRewards, currentUser, users, createPromo, updatePromo, updateReview, createReward, updateReward, updateRewardStatus, deleteReward } = useAdminData();
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [promoTouched, setPromoTouched] = useState({});
  const [isSavingPromo, setIsSavingPromo] = useState(false);
  const [rewardError, setRewardError] = useState("");
  const [rewardTouched, setRewardTouched] = useState({});
  const [isSavingReward, setIsSavingReward] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState("");
  const [editingRewardId, setEditingRewardId] = useState("");
  const [securityConfirm, setSecurityConfirm] = useState(null);
  const [rewardFilters, setRewardFilters] = useState({ query: "", rarity: "", active: "" });
  const [rewardHistoryFilters, setRewardHistoryFilters] = useState({
    query: "",
    status: "",
    type: "",
    code: "",
    bookingId: "",
    milestone: "",
    dateFrom: "",
    dateTo: "",
  });
  const [rewardHistoryCustomerKey, setRewardHistoryCustomerKey] = useState("");
  const [activeRewardHistoryCustomerKey, setActiveRewardHistoryCustomerKey] = useState("");
  const [promoForm, setPromoForm] = useState({
    title: "",
    code: "",
    status: "Draft",
    message: "",
    discountType: "Percentage",
    discountValue: "",
    maxUsagePerUser: "",
    expiryMode: "none",
    expiresAt: "",
    usageLimit: "",
  });
  const [rewardForm, setRewardForm] = useState({
    name: "",
    type: "",
    originalType: "",
    description: "",
    value: "",
    rarity: "Common",
    weight: "10",
    active: true,
    stock: "",
    expirationDays: "30",
  });
  const promoSavingRef = useRef(false);
  const rewardSavingRef = useRef(false);
  const promoValidationErrors = useMemo(() => validatePromoForm(promoForm), [promoForm]);
  const isPromoFormValid = Object.keys(promoValidationErrors).length === 0;
  const isPromoSaveDisabled = !isPromoFormValid || isSavingPromo;
  const rewardValidationErrors = useMemo(() => validateRewardForm(rewardForm), [rewardForm]);
  const isRewardFormValid = Object.keys(rewardValidationErrors).length === 0;
  const isRewardSaveDisabled = !isRewardFormValid || isSavingReward;

  const shouldShowPromoError = (field) => Boolean(promoValidationErrors[field] && (promoTouched[field] || promoTouched.submit));
  const getPromoFieldError = (field) => shouldShowPromoError(field) ? promoValidationErrors[field] : "";
  const markPromoFieldTouched = (field) => setPromoTouched((prev) => ({ ...prev, [field]: true }));
  const updatePromoField = (field, value) => {
    setPromoForm((prev) => ({ ...prev, [field]: value }));
  };
  const shouldShowRewardError = (field) => Boolean(rewardValidationErrors[field] && (rewardTouched[field] || rewardTouched.submit));
  const getRewardFieldError = (field) => shouldShowRewardError(field) ? rewardValidationErrors[field] : "";
  const markRewardFieldTouched = (field) => setRewardTouched((prev) => ({ ...prev, [field]: true }));
  const updateRewardField = (field, value) => {
    setRewardForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetRewardForm = () => {
    setEditingRewardId("");
    setRewardForm({
      name: "",
      type: "",
      originalType: "",
      description: "",
      value: "",
      rarity: "Common",
      weight: "10",
      active: true,
      stock: "",
      expirationDays: "30",
    });
    setRewardError("");
    setRewardTouched({});
    setIsSavingReward(false);
    rewardSavingRef.current = false;
  };

  const openEditRewardModal = (reward) => {
    const originalType = reward.rewardType || reward.type || "";
    setEditingRewardId(reward.id || "");
    setRewardForm({
      name: reward.name || "",
      type: canonicalRewardTypeToUiCategory(originalType),
      originalType,
      description: reward.description || "",
      value: reward.value || "",
      rarity: reward.rarity || "Common",
      weight: String(reward.weight || ""),
      active: Boolean(reward.active),
      stock: String(Number(reward.stock || 0) || ""),
      expirationDays: String(Number(reward.expirationDays || 0) || ""),
    });
    setRewardError("");
    setRewardTouched({});
    setIsSavingReward(false);
    rewardSavingRef.current = false;
    setIsRewardModalOpen(true);
  };

  const filteredRewards = rewards
    .filter((reward) => {
      const q = rewardFilters.query.trim().toLowerCase();
      const matchesQuery = !q || `${reward.name} ${getRewardTypeSearchText(reward.rewardType || reward.type)} ${reward.description} ${reward.value}`.toLowerCase().includes(q);
      const matchesRarity = !rewardFilters.rarity || reward.rarity === rewardFilters.rarity;
      const matchesActive = !rewardFilters.active || (rewardFilters.active === "Enabled" ? reward.active : !reward.active);
      return matchesQuery && matchesRarity && matchesActive;
    })
    .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
  const customerOptions = users.filter((user) => String(user.userType || user.role || "").trim().toLowerCase() === "customer");
  const getUserId = (user) => String(user?.id || user?._id || "").trim();
  const getCustomerKey = (user) => getUserId(user) || String(user?.email || "").trim().toLowerCase();
  const selectedRewardHistoryCustomer = customerOptions.find((user) => getCustomerKey(user) === rewardHistoryCustomerKey);
  const activeRewardHistoryCustomer = customerOptions.find((user) => getCustomerKey(user) === activeRewardHistoryCustomerKey);

  const filteredCustomerRewards = customerRewards.filter((reward) => {
    const q = rewardHistoryFilters.query.trim().toLowerCase();
    const status = getRewardStatus(reward);
    const granted = reward.dateGranted || reward.dateEarned || "";
    const used = reward.usedAt || "";
    const activeCustomerId = getUserId(activeRewardHistoryCustomer);
    const activeCustomerEmail = String(activeRewardHistoryCustomer?.email || "").trim().toLowerCase();
    const rewardCustomerId = String(reward.customerId || "").trim();
    const rewardCustomerEmail = String(reward.customerEmail || "").trim().toLowerCase();
    const matchesSelectedCustomer = !activeRewardHistoryCustomerKey ||
      (activeCustomerId && rewardCustomerId === activeCustomerId) ||
      (!rewardCustomerId && activeCustomerEmail && rewardCustomerEmail === activeCustomerEmail);
    const haystack = [
      reward.customerName,
      reward.customerEmail,
      reward.rewardName,
      reward.rewardCode,
      reward.claimCode,
      reward.linkedBookingId,
      reward.reservedBookingId,
      reward.milestoneNumber,
      reward.milestoneKey,
      status,
    ].join(" ").toLowerCase();
    return (
      matchesSelectedCustomer &&
      (!q || haystack.includes(q)) &&
      (!rewardHistoryFilters.status || status === rewardHistoryFilters.status) &&
      (!rewardHistoryFilters.type || `${getRewardTypeSearchText(reward.rewardType)} ${reward.rewardType || ""}`.toLowerCase().includes(rewardHistoryFilters.type.toLowerCase())) &&
      (!rewardHistoryFilters.code || String(reward.rewardCode || reward.claimCode || "").toLowerCase().includes(rewardHistoryFilters.code.toLowerCase())) &&
      (!rewardHistoryFilters.bookingId || [reward.linkedBookingId, reward.reservedBookingId].some((value) => String(value || "").toLowerCase().includes(rewardHistoryFilters.bookingId.toLowerCase()))) &&
      (!rewardHistoryFilters.milestone || String(reward.milestoneNumber || reward.milestoneKey || "").toLowerCase().includes(rewardHistoryFilters.milestone.toLowerCase())) &&
      (!rewardHistoryFilters.dateFrom || granted >= rewardHistoryFilters.dateFrom || used >= rewardHistoryFilters.dateFrom) &&
      (!rewardHistoryFilters.dateTo || (granted && granted <= rewardHistoryFilters.dateTo) || (used && used <= rewardHistoryFilters.dateTo))
    );
  });
  const getRewardId = (reward) => String(reward?.id || reward?._id || "").trim();
  const isRewardEnabled = (reward) => reward?.active === true ? true : reward?.enabled !== undefined ? Boolean(reward.enabled) : reward?.active !== false;

  const openRewardStatusConfirm = (reward, enabled) => {
    const rewardId = getRewardId(reward);
    setSecurityConfirm({
      mode: "pin",
      title: enabled ? "Enable Reward" : "Disable Reward",
      message: "Enter the special PIN before changing reward availability.",
      actionKey: ACTION_KEYS.engagementManage,
      onConfirm: async () => {
        await updateRewardStatus(rewardId, enabled);
        setSecurityConfirm(null);
      },
    });
  };

  const saveReward = async () => {
    const validationErrors = validateRewardForm(rewardForm);
    if (Object.keys(validationErrors).length > 0) {
      setRewardTouched({ ...markAllRewardFieldsTouched(), submit: true });
      return false;
    }
    if (rewardSavingRef.current) return false;
    rewardSavingRef.current = true;
    setIsSavingReward(true);
    const rewardFields = { ...rewardForm };
    delete rewardFields.originalType;
    const payload = {
      ...rewardFields,
      name: rewardForm.name.trim(),
      type: uiCategoryToCanonicalRewardType(rewardForm.type, {
        previousCanonicalType: rewardForm.originalType,
      }),
      description: rewardForm.description.trim(),
      value: rewardForm.value.trim(),
      rarity: rewardForm.rarity.trim(),
      weight: Number(String(rewardForm.weight).trim()),
      stock: Number(String(rewardForm.stock).trim()),
      expirationDays: Number(String(rewardForm.expirationDays).trim()),
    };
    try {
      if (editingRewardId) {
        await updateReward(editingRewardId, payload);
      } else {
        await createReward(payload);
      }
      setIsRewardModalOpen(false);
      resetRewardForm();
      return true;
    } catch (error) {
      setIsSavingReward(false);
      rewardSavingRef.current = false;
      throw error;
    }
  };

  const getPromoExpiryLabel = (promo) => {
    const expiryMode = String(promo.expiryMode || "none").toLowerCase();
    if (expiryMode === "date" && promo.expiresAt) {
      return `Expires ${new Date(promo.expiresAt).toLocaleString("en-PH")}`;
    }
    if (expiryMode === "usage") {
      const limit = Number(promo.usageLimit || 0);
      const used = Number(promo.usageCount || 0);
      const perUserLimit = Number(promo.maxUsagePerUser || 0);
      return `Used ${used}/${limit}${perUserLimit > 0 ? ` • Max ${perUserLimit}/user` : ""}${promo.status === "Expired" ? " • Limit reached" : ""}`;
    }
    return Number(promo.maxUsagePerUser || 0) > 0 ? `No automatic expiry • Max ${Number(promo.maxUsagePerUser || 0)}/user` : "No automatic expiry";
  };

  const stars = (n) => {
    const x = Math.max(0, Math.min(5, Number(n) || 0));
    return "★".repeat(x) + "☆".repeat(5 - x);
  };

  const resetPromoForm = () => {
    setEditingPromoId("");
    setPromoForm({
      title: "",
      code: "",
      status: "Draft",
      message: "",
      discountType: "Percentage",
      discountValue: "",
      maxUsagePerUser: "",
      expiryMode: "none",
      expiresAt: "",
      usageLimit: "",
    });
    setPromoError("");
    setPromoTouched({});
    setIsSavingPromo(false);
    promoSavingRef.current = false;
  };

  const openEditPromoModal = (promo) => {
    setEditingPromoId(promo.id || "");
    setPromoForm({
      title: promo.title || "",
      code: promo.code || "",
      status: promo.status === "Expired" ? "Active" : promo.status || "Draft",
      message: promo.message || "",
      discountType: promo.discountType || "Percentage",
      discountValue: String(Number(promo.discountValue || promo.discountPercent || 0) || ""),
      maxUsagePerUser: String(Number(promo.maxUsagePerUser || 0) || ""),
      expiryMode: promo.expiryMode || "none",
      expiresAt: promo.expiresAt ? new Date(promo.expiresAt).toISOString().slice(0, 16) : "",
      usageLimit: String(Number(promo.usageLimit || 0) || ""),
    });
    setPromoError("");
    setPromoTouched({});
    setIsSavingPromo(false);
    promoSavingRef.current = false;
    setIsPromoModalOpen(true);
  };

  const exportReviewsPdf = () =>
    downloadAuthenticatedFile(buildReportDownloadPath("reviews", "pdf"), "autoflow-review-report.pdf")
      .catch((error) => window.alert(error.message || "Could not download report."));

  const exportPromosPdf = () =>
    downloadAuthenticatedFile(buildReportDownloadPath("promotions", "pdf"), "autoflow-promotion-report.pdf")
      .catch((error) => window.alert(error.message || "Could not download report."));
  const exportRewardsPdf = () =>
    downloadAuthenticatedFile(buildReportDownloadPath("rewards", "pdf"), "autoflow-reward-pool-report.pdf")
      .catch((error) => window.alert(error.message || "Could not download report."));
  const exportRewardHistoryPdf = () =>
    downloadAuthenticatedFile(buildReportDownloadPath("reward-history", "pdf"), "autoflow-reward-history-report.pdf")
      .catch((error) => window.alert(error.message || "Could not download report."));

  return (
    <div className="engWrap">
      <div className="engGrid">
        <div className="engCard">
          <div className="engHead">
            <div>
              <div className="engTitle">Reviews</div>
              <div className="engSub">Customer feedback</div>
            </div>
            <button className="engBtnDark" type="button" onClick={exportReviewsPdf}>Export as PDF</button>
          </div>

          <div className="engTableWrap">
            <div className="engTableHead"><div>Customer</div><div>Rating</div><div>Comment</div><div>Status</div><div>Actions</div></div>
            {reviews.map((r) => (
              <div className="engTableRow" key={r.id}>
                <div className="engClient">{r.customer}</div>
                <div className="engRating">{stars(r.rating)}</div>
                <div className="engComment">{r.comment}</div>
                <div><span className="engStatusBadge">{r.status || "Pending"}</span></div>
                <div className="engRewardActions">
                  <button className="engBtnLight engBtnAuto" type="button" onClick={() => updateReview?.(r.id, { status: "Published" })}>Publish</button>
                  <button className="engBtnLight engBtnAuto" type="button" onClick={() => updateReview?.(r.id, { status: "Hidden" })}>Hide</button>
                  <button className="engBtnLight engBtnAuto danger" type="button" onClick={() => updateReview?.(r.id, { status: "Archived" })}>Archive</button>
                </div>
              </div>
            ))}
            {reviews.length === 0 && <div className="engEmpty">No reviews yet.</div>}
          </div>
        </div>

        <div className="engCard">
          <div className="engHead">
            <div>
              <div className="engTitle">Promos</div>
              <div className="engSub">Saved promos</div>
            </div>
            <div className="engHeadActions">
              <button className="engBtnDark" type="button" onClick={exportPromosPdf}>Export as PDF</button>
              <button
                className="engBtnGold engBtnAuto"
                type="button"
                onClick={() => {
                  resetPromoForm();
                  setIsPromoModalOpen(true);
                }}
              >
                Add Promo
              </button>
            </div>
          </div>

          <div className="engTableWrap engPromoTableWrap">
            <div className="engPromoTableInner">
              <div className="engTableHead engPromoTableHead"><div>Title</div><div>Discount</div><div>Per User</div><div>Status</div><div>Expiry</div><div>Message</div><div>Actions</div></div>
              {promos.map((promo) => (
                <div className="engTableRow engPromoTableRow" key={promo.id}>
                  <div className="engClient">{promo.title}</div>
                  <div className="engMetaText">{promo.discountType === "Fixed" ? `P ${Number(promo.discountValue || 0)} off` : `${Number(promo.discountValue || promo.discountPercent || 0)}% off`}</div>
                  <div className="engMetaText">
                    {Number(promo.maxUsagePerUser || 0) > 0 ? `Max ${Number(promo.maxUsagePerUser || 0)}/user` : "-"}
                  </div>
                  <div className="engPromoStatusCell">
                    <span className={`engStatusBadge ${
                      String(promo.status || "").trim().toLowerCase() === "active"
                        ? "active"
                        : String(promo.status || "").trim().toLowerCase() === "expired"
                          ? "expired"
                          : "draft"
                    }`}>
                      {promo.status}
                    </span>
                  </div>
                  <div className="engMetaText">{getPromoExpiryLabel(promo)}</div>
                  <div className="engComment">{promo.message}</div>
                  <div className="engPromoActionCell">
                    <button className="engBtnLight engBtnAuto engPromoEditBtn" type="button" onClick={() => openEditPromoModal(promo)}>
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {promos.length === 0 && <div className="engEmpty">No promos saved yet.</div>}
          </div>
        </div>
      </div>

      <div className="engCard engRewardCard">
        <div className="engHead">
          <div>
            <div className="engTitle">Reward Pool Management</div>
            <div className="engSub">Admin-managed weighted rewards for every 3 completed bookings.</div>
          </div>
          <div className="engHeadActions">
            <button className="engBtnDark" type="button" onClick={exportRewardsPdf}>Export as PDF</button>
            <button className="engBtnGold engBtnAuto" type="button" onClick={() => { resetRewardForm(); setIsRewardModalOpen(true); }}>Add Reward</button>
          </div>
        </div>
        <div className="engRewardFilters">
          <input value={rewardFilters.query} onChange={(event) => setRewardFilters((prev) => ({ ...prev, query: event.target.value }))} placeholder="Search reward" />
          <select value={rewardFilters.rarity} onChange={(event) => setRewardFilters((prev) => ({ ...prev, rarity: event.target.value }))}><option value="">All rarity</option><option>Common</option><option>Uncommon</option><option>Rare</option></select>
          <select value={rewardFilters.active} onChange={(event) => setRewardFilters((prev) => ({ ...prev, active: event.target.value }))}><option value="">All status</option><option>Enabled</option><option>Disabled</option></select>
        </div>
        <div className="engRewardTable">
          <div className="engRewardHead"><div>Name</div><div>Type</div><div>Value</div><div>Rarity</div><div>Weight</div><div>Status</div><div>Actions</div></div>
          {filteredRewards.map((reward) => (
            <div className="engRewardRow" key={getRewardId(reward) || reward.name}>
              <div><strong>{reward.name}</strong><span>{reward.description}</span></div>
              <div>{canonicalRewardTypeToUiCategory(reward.rewardType || reward.type) || "-"}</div>
              <div>{reward.value || "-"}</div>
              <div>{reward.rarity}</div>
              <div>{Number(reward.weight || 0)}</div>
              <div><span className={`engStatusBadge ${isRewardEnabled(reward) ? "active" : "draft"}`}>{isRewardEnabled(reward) ? "Enabled" : "Disabled"}</span></div>
              <div className="engRewardActions">
                <button className="engBtnLight engBtnAuto" type="button" onClick={() => openEditRewardModal(reward)}>Edit</button>
                <button className="engBtnLight engBtnAuto" type="button" onClick={() => openRewardStatusConfirm(reward, !isRewardEnabled(reward))}>{isRewardEnabled(reward) ? "Disable" : "Enable"}</button>
                <button className="engBtnLight engBtnAuto danger" type="button" onClick={() => setSecurityConfirm({ mode: "pin", title: "Delete Reward", message: "Enter the special PIN before deleting this reward.", onConfirm: async () => { await deleteReward(getRewardId(reward)); setSecurityConfirm(null); } })}>Delete</button>
              </div>
            </div>
          ))}
          {filteredRewards.length === 0 && <div className="engEmpty">No rewards found.</div>}
        </div>
      </div>

      <div className="engCard engRewardHistoryCard">
        <div className="engRewardHistory">
          <div className="engRewardHistoryHead">
            <div>
              <div className="engTitle">Reward History</div>
              <div className="engSub">Generated rewards and claim status.</div>
            </div>
            <div className="engManualReward">
              <button className="engBtnDark" type="button" onClick={exportRewardHistoryPdf}>Export as PDF</button>
              <select value={rewardHistoryCustomerKey} onChange={(event) => {
                const nextValue = event.target.value;
                setRewardHistoryCustomerKey(nextValue);
                if (!nextValue) {
                  setActiveRewardHistoryCustomerKey("");
                }
              }}>
                <option value="">Select customer</option>
                {customerOptions.map((user) => <option key={getCustomerKey(user)} value={getCustomerKey(user)}>{user.name || user.email}</option>)}
              </select>
              <button className="engBtnLight engBtnAuto" type="button" disabled={!selectedRewardHistoryCustomer} onClick={() => setActiveRewardHistoryCustomerKey(rewardHistoryCustomerKey)}>View Reward History</button>
            </div>
          </div>
          <div className="engRewardFilters engRewardHistoryFilters">
            <input value={rewardHistoryFilters.query} onChange={(event) => setRewardHistoryFilters((prev) => ({ ...prev, query: event.target.value }))} placeholder="Search customer, reward, booking..." />
            <select value={rewardHistoryFilters.status} onChange={(event) => setRewardHistoryFilters((prev) => ({ ...prev, status: event.target.value }))}><option value="">All status</option><option>Available</option><option>Claimed</option><option>Reserved</option><option>Used</option><option>Expired</option><option>Released</option></select>
            <input value={rewardHistoryFilters.type} onChange={(event) => setRewardHistoryFilters((prev) => ({ ...prev, type: event.target.value }))} placeholder="Reward type" />
            <input value={rewardHistoryFilters.code} onChange={(event) => setRewardHistoryFilters((prev) => ({ ...prev, code: event.target.value }))} placeholder="Reward code" />
            <input value={rewardHistoryFilters.bookingId} onChange={(event) => setRewardHistoryFilters((prev) => ({ ...prev, bookingId: event.target.value }))} placeholder="Booking ID" />
            <input value={rewardHistoryFilters.milestone} onChange={(event) => setRewardHistoryFilters((prev) => ({ ...prev, milestone: event.target.value }))} placeholder="Milestone" />
            <input type="date" value={rewardHistoryFilters.dateFrom} onChange={(event) => setRewardHistoryFilters((prev) => ({ ...prev, dateFrom: event.target.value }))} />
            <input type="date" value={rewardHistoryFilters.dateTo} onChange={(event) => setRewardHistoryFilters((prev) => ({ ...prev, dateTo: event.target.value }))} />
          </div>
          {filteredCustomerRewards.map((reward) => {
            const rewardStatus = getRewardStatus(reward);
            return (
              <div className="engRewardHistoryRow" key={reward.id}>
                <span>{reward.customerName}</span>
                <strong>{reward.rewardName}</strong>
                <span className={`engStatusBadge ${rewardStatus === "Used" ? "expired" : "active"}`}>{rewardStatus}</span>
                <code>{reward.claimCode}</code>
              </div>
            );
          })}
          {filteredCustomerRewards.length === 0 && <div className="engEmpty">No generated rewards matched the filters.</div>}
        </div>
      </div>

      {isPromoModalOpen && (
        <div className="engModalOverlay" onMouseDown={(event) => {
          if (event.target.classList.contains("engModalOverlay")) {
            setIsPromoModalOpen(false);
            resetPromoForm();
          }
        }}>
          <div className="engModalCard" role="dialog" aria-modal="true" aria-labelledby="promo-modal-title">
            <div className="engModalHead">
              <div>
                <div className="engTitle" id="promo-modal-title">{editingPromoId ? "Edit Promo" : "Add Promo"}</div>
                <div className="engSub">{editingPromoId ? "Update the selected promo details." : "Create a new promo for staff and customers."}</div>
              </div>
              <button className="engModalClose" type="button" onClick={() => {
                setIsPromoModalOpen(false);
                resetPromoForm();
              }}>✕</button>
            </div>

            <form
              noValidate
              onSubmit={async (event) => {
                event.preventDefault();
                setPromoError("");
                const validationErrors = validatePromoForm(promoForm);
                if (Object.keys(validationErrors).length > 0) {
                  setPromoTouched({ ...markAllPromoFieldsTouched(), submit: true });
                  return;
                }
                if (promoSavingRef.current) return;
                promoSavingRef.current = true;
                setIsSavingPromo(true);

                try {
                  const payload = {
                    ...promoForm,
                    title: promoForm.title.trim(),
                    code: promoForm.code.trim(),
                    message: promoForm.message.trim(),
                  };
                  if (editingPromoId) {
                    await updatePromo(editingPromoId, payload);
                  } else {
                    await createPromo(payload);
                  }
                  setIsPromoModalOpen(false);
                  resetPromoForm();
                } catch (error) {
                  setPromoError(error.message || `Failed to ${editingPromoId ? "update" : "create"} promo.`);
                  setIsSavingPromo(false);
                  promoSavingRef.current = false;
                }
              }}
              className="engModalBody"
            >
              <label className="engField">
                <span>Title</span>
                <input
                  id="promo-title"
                  value={promoForm.title}
                  onChange={(event) => updatePromoField("title", event.target.value)}
                  onBlur={() => markPromoFieldTouched("title")}
                  placeholder="Promo title"
                  required
                  aria-invalid={shouldShowPromoError("title") ? "true" : undefined}
                  aria-describedby={getPromoFieldError("title") ? "promo-title-error" : undefined}
                />
                {getPromoFieldError("title") ? <div id="promo-title-error" className="engFieldError">{getPromoFieldError("title")}</div> : null}
              </label>

              <label className="engField">
                <span>Code</span>
                <input
                  id="promo-code"
                  value={promoForm.code}
                  onChange={(event) => updatePromoField("code", event.target.value)}
                  onBlur={() => markPromoFieldTouched("code")}
                  placeholder="SAVE10"
                  required
                  aria-invalid={shouldShowPromoError("code") ? "true" : undefined}
                  aria-describedby={getPromoFieldError("code") ? "promo-code-error" : undefined}
                />
                {getPromoFieldError("code") ? <div id="promo-code-error" className="engFieldError">{getPromoFieldError("code")}</div> : null}
              </label>

              <label className="engField">
                <span>Discount</span>
                <div className="engFieldRow">
                  <select
                    aria-label="Discount Type"
                    value={promoForm.discountType}
                    onChange={(event) => updatePromoField("discountType", event.target.value)}
                  >
                    <option value="Percentage">Percentage</option>
                    <option value="Fixed">Fixed</option>
                  </select>
                  <input
                    id="promo-discount-value"
                    type="text"
                    inputMode="decimal"
                    value={promoForm.discountValue}
                    onChange={(event) => updatePromoField("discountValue", event.target.value)}
                    onBlur={() => markPromoFieldTouched("discountValue")}
                    placeholder={promoForm.discountType === "Percentage" ? "e.g. 10" : "e.g. 500"}
                    required
                    aria-invalid={shouldShowPromoError("discountValue") ? "true" : undefined}
                    aria-describedby={getPromoFieldError("discountValue") ? "promo-discount-value-error" : undefined}
                  />
                </div>
                {getPromoFieldError("discountValue") ? <div id="promo-discount-value-error" className="engFieldError">{getPromoFieldError("discountValue")}</div> : null}
              </label>

              <div className="engFieldRow">
                <label className="engField">
                  <span>Max Usage Per User</span>
                  <input
                    id="promo-max-usage-per-user"
                    type="text"
                    inputMode="numeric"
                    value={promoForm.maxUsagePerUser}
                    onChange={(event) => updatePromoField("maxUsagePerUser", event.target.value)}
                    onBlur={() => markPromoFieldTouched("maxUsagePerUser")}
                    placeholder="e.g. 1"
                    required
                    aria-invalid={shouldShowPromoError("maxUsagePerUser") ? "true" : undefined}
                    aria-describedby={getPromoFieldError("maxUsagePerUser") ? "promo-max-usage-per-user-error" : undefined}
                  />
                  {getPromoFieldError("maxUsagePerUser") ? <div id="promo-max-usage-per-user-error" className="engFieldError">{getPromoFieldError("maxUsagePerUser")}</div> : null}
                </label>

                <label className="engField">
                  <span>Status</span>
                  <select
                    value={promoForm.status}
                    onChange={(event) => updatePromoField("status", event.target.value)}
                  >
                    <option value="Draft">Draft</option>
                    <option value="Active">Active</option>
                  </select>
                </label>
              </div>

              <div className="engFieldRow">
                <label className="engField">
                  <span>Expiry Type</span>
                  <select
                    value={promoForm.expiryMode}
                    onChange={(event) =>
                      setPromoForm((prev) => ({
                        ...prev,
                        expiryMode: event.target.value,
                        expiresAt: event.target.value === "date" ? prev.expiresAt : "",
                        usageLimit: event.target.value === "usage" ? prev.usageLimit : "",
                      }))
                    }
                  >
                    <option value="none">No automatic expiry</option>
                    <option value="date">Time limit</option>
                    <option value="usage">Usage limit</option>
                  </select>
                </label>

                {promoForm.expiryMode === "date" ? (
                  <label className="engField">
                    <span>Expires At</span>
                    <input
                      id="promo-expires-at"
                      type="datetime-local"
                      value={promoForm.expiresAt}
                      onChange={(event) => updatePromoField("expiresAt", event.target.value)}
                      onBlur={() => markPromoFieldTouched("expiresAt")}
                      required
                      aria-invalid={shouldShowPromoError("expiresAt") ? "true" : undefined}
                      aria-describedby={getPromoFieldError("expiresAt") ? "promo-expires-at-error" : undefined}
                    />
                    {getPromoFieldError("expiresAt") ? <div id="promo-expires-at-error" className="engFieldError">{getPromoFieldError("expiresAt")}</div> : null}
                  </label>
                ) : promoForm.expiryMode === "usage" ? (
                  <label className="engField">
                    <span>Usage Limit</span>
                    <input
                      id="promo-usage-limit"
                      type="number"
                      min="1"
                      value={promoForm.usageLimit}
                      onChange={(event) => updatePromoField("usageLimit", event.target.value)}
                      onBlur={() => markPromoFieldTouched("usageLimit")}
                      placeholder="Total allowed uses"
                      required
                      aria-invalid={shouldShowPromoError("usageLimit") ? "true" : undefined}
                      aria-describedby={getPromoFieldError("usageLimit") ? "promo-usage-limit-error" : undefined}
                    />
                    {getPromoFieldError("usageLimit") ? <div id="promo-usage-limit-error" className="engFieldError">{getPromoFieldError("usageLimit")}</div> : null}
                  </label>
                ) : (
                  <div className="engField engFieldHint">
                    <span>Automation</span>
                    <div className="engFieldStatic">This promo stays active until you replace it with another status rule.</div>
                  </div>
                )}
              </div>

              <label className="engField">
                <span>Message</span>
                <textarea
                  id="promo-message"
                  rows="5"
                  value={promoForm.message}
                  onChange={(event) => updatePromoField("message", event.target.value)}
                  onBlur={() => markPromoFieldTouched("message")}
                  placeholder="Write the promo details..."
                  aria-invalid={shouldShowPromoError("message") ? "true" : undefined}
                  aria-describedby={getPromoFieldError("message") ? "promo-message-error" : undefined}
                />
                {getPromoFieldError("message") ? <div id="promo-message-error" className="engFieldError">{getPromoFieldError("message")}</div> : null}
              </label>

              {promoError ? <div className="engFieldError">{promoError}</div> : null}

              <div className="engModalActions">
                <button className="engBtnLight engBtnAuto" type="button" onClick={() => {
                  setIsPromoModalOpen(false);
                  resetPromoForm();
                }}>
                  Cancel
                </button>
                <button className="engBtnGold engBtnAuto" type="submit" disabled={isPromoSaveDisabled}>
                  {isSavingPromo ? "Saving..." : editingPromoId ? "Update Promo" : "Save Promo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isRewardModalOpen && (
        <div className="engModalOverlay" onMouseDown={(event) => { if (event.target.classList.contains("engModalOverlay")) { setIsRewardModalOpen(false); resetRewardForm(); } }}>
          <div className="engModalCard" role="dialog" aria-modal="true" aria-labelledby="reward-modal-title">
            <div className="engModalHead">
              <div>
                <div className="engTitle" id="reward-modal-title">{editingRewardId ? "Edit Reward" : "Add Reward"}</div>
                <div className="engSub">Configure the reward pool item.</div>
              </div>
              <button className="engModalClose" type="button" onClick={() => { setIsRewardModalOpen(false); resetRewardForm(); }}>✕</button>
            </div>

            <form
              className="engModalBody"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                setRewardError("");
                const validationErrors = validateRewardForm(rewardForm);
                if (Object.keys(validationErrors).length > 0) {
                  setRewardTouched({ ...markAllRewardFieldsTouched(), submit: true });
                  return;
                }
                const weightChanged = editingRewardId && Number(rewardForm.weight || 0) !== Number(rewards.find((item) => item.id === editingRewardId)?.weight || 0);
                const action = async () => {
                  try {
                    const saved = await saveReward();
                    if (saved) setSecurityConfirm(null);
                  } catch (error) {
                    setRewardError(error.message || "Failed to save reward.");
                  }
                };
                if (weightChanged) {
                  setSecurityConfirm({ mode: "pin", title: "Change Reward Weight", message: "Enter the special PIN before changing a reward weight.", onConfirm: action });
                  return;
                }
                action();
              }}
            >
              <label className="engField" htmlFor="reward-name">
                <span>Reward Name</span>
                <input
                  id="reward-name"
                  value={rewardForm.name}
                  onChange={(event) => updateRewardField("name", event.target.value)}
                  onBlur={() => markRewardFieldTouched("name")}
                  required
                  aria-invalid={shouldShowRewardError("name") ? "true" : undefined}
                  aria-describedby={getRewardFieldError("name") ? "reward-name-error" : undefined}
                />
                {getRewardFieldError("name") ? <div id="reward-name-error" className="engFieldError">{getRewardFieldError("name")}</div> : null}
              </label>

              <label className="engField" htmlFor="reward-type">
                <span>Type</span>
                <select
                  id="reward-type"
                  value={rewardForm.type}
                  onChange={(event) => setRewardForm((prev) => ({
                    ...prev,
                    type: event.target.value,
                    value: event.target.value === prev.type ? prev.value : "",
                  }))}
                  onBlur={() => markRewardFieldTouched("type")}
                  required
                  aria-invalid={shouldShowRewardError("type") ? "true" : undefined}
                  aria-describedby={getRewardFieldError("type") ? "reward-type-error" : undefined}
                >
                  <option value="">Select type</option>
                  {REWARD_UI_CATEGORIES.map((option) => <option key={option}>{option}</option>)}
                </select>
                {getRewardFieldError("type") ? <div id="reward-type-error" className="engFieldError">{getRewardFieldError("type")}</div> : null}
              </label>

              <label className="engField" htmlFor="reward-description">
                <span>Description</span>
                <textarea
                  id="reward-description"
                  value={rewardForm.description}
                  onChange={(event) => updateRewardField("description", event.target.value)}
                  onBlur={() => markRewardFieldTouched("description")}
                  required
                  aria-invalid={shouldShowRewardError("description") ? "true" : undefined}
                  aria-describedby={getRewardFieldError("description") ? "reward-description-error" : undefined}
                />
                {getRewardFieldError("description") ? <div id="reward-description-error" className="engFieldError">{getRewardFieldError("description")}</div> : null}
              </label>

              <label className="engField" htmlFor="reward-value">
                <span>Value</span>
                <input
                  id="reward-value"
                  type="text"
                  inputMode={rewardForm.type === "Discount" ? "decimal" : "text"}
                  value={rewardForm.value}
                  onChange={(event) => updateRewardField("value", event.target.value)}
                  onBlur={() => markRewardFieldTouched("value")}
                  placeholder={rewardForm.type === "Discount" ? "5" : "Free Car Wash"}
                  required
                  aria-invalid={shouldShowRewardError("value") ? "true" : undefined}
                  aria-describedby={getRewardFieldError("value") ? "reward-value-error" : undefined}
                />
                {getRewardFieldError("value") ? <div id="reward-value-error" className="engFieldError">{getRewardFieldError("value")}</div> : null}
              </label>

              <div className="engFieldRow">
                <label className="engField" htmlFor="reward-rarity">
                  <span>Rarity</span>
                  <select
                    id="reward-rarity"
                    value={rewardForm.rarity}
                    onChange={(event) => updateRewardField("rarity", event.target.value)}
                    onBlur={() => markRewardFieldTouched("rarity")}
                    aria-invalid={shouldShowRewardError("rarity") ? "true" : undefined}
                    aria-describedby={getRewardFieldError("rarity") ? "reward-rarity-error" : undefined}
                  >
                    {REWARD_RARITIES.map((option) => <option key={option}>{option}</option>)}
                  </select>
                  {getRewardFieldError("rarity") ? <div id="reward-rarity-error" className="engFieldError">{getRewardFieldError("rarity")}</div> : null}
                </label>

                <label className="engField" htmlFor="reward-weight">
                  <span>Weight / Chance</span>
                  <input
                    id="reward-weight"
                    type="text"
                    inputMode="decimal"
                    value={rewardForm.weight}
                    onChange={(event) => updateRewardField("weight", event.target.value)}
                    onBlur={() => markRewardFieldTouched("weight")}
                    required
                    aria-invalid={shouldShowRewardError("weight") ? "true" : undefined}
                    aria-describedby={getRewardFieldError("weight") ? "reward-weight-error" : undefined}
                  />
                  {getRewardFieldError("weight") ? <div id="reward-weight-error" className="engFieldError">{getRewardFieldError("weight")}</div> : null}
                </label>
              </div>

              <div className="engFieldRow">
                <label className="engField" htmlFor="reward-stock">
                  <span>Stock</span>
                  <input
                    id="reward-stock"
                    type="text"
                    inputMode="numeric"
                    value={rewardForm.stock}
                    onChange={(event) => updateRewardField("stock", event.target.value)}
                    onBlur={() => markRewardFieldTouched("stock")}
                    required
                    aria-invalid={shouldShowRewardError("stock") ? "true" : undefined}
                    aria-describedby={getRewardFieldError("stock") ? "reward-stock-error" : undefined}
                  />
                  {getRewardFieldError("stock") ? <div id="reward-stock-error" className="engFieldError">{getRewardFieldError("stock")}</div> : null}
                </label>

                <label className="engField" htmlFor="reward-expiration-days">
                  <span>Expiration Days</span>
                  <input
                    id="reward-expiration-days"
                    type="text"
                    inputMode="numeric"
                    value={rewardForm.expirationDays}
                    onChange={(event) => updateRewardField("expirationDays", event.target.value)}
                    onBlur={() => markRewardFieldTouched("expirationDays")}
                    required
                    aria-invalid={shouldShowRewardError("expirationDays") ? "true" : undefined}
                    aria-describedby={getRewardFieldError("expirationDays") ? "reward-expiration-days-error" : undefined}
                  />
                  {getRewardFieldError("expirationDays") ? <div id="reward-expiration-days-error" className="engFieldError">{getRewardFieldError("expirationDays")}</div> : null}
                </label>
              </div>

              <label className="engCheckField">
                <input type="checkbox" checked={rewardForm.active} onChange={(event) => updateRewardField("active", event.target.checked)} />
                Enabled
              </label>
              {rewardError ? <div className="engFieldError">{rewardError}</div> : null}
              <div className="engModalActions">
                <button className="engBtnLight engBtnAuto" type="button" onClick={() => { setIsRewardModalOpen(false); resetRewardForm(); }}>Cancel</button>
                <button className="engBtnGold engBtnAuto" type="submit" disabled={isRewardSaveDisabled}>
                  {isSavingReward ? "Saving..." : editingRewardId ? "Update Reward" : "Save Reward"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SecurityConfirmModal open={Boolean(securityConfirm)} mode={securityConfirm?.mode || "pin"} title={securityConfirm?.title} message={securityConfirm?.message} currentUser={currentUser} onClose={() => setSecurityConfirm(null)} actionKey={securityConfirm?.actionKey || ACTION_KEYS.engagementManage}
        onConfirm={securityConfirm?.onConfirm} />
    </div>
  );
}
