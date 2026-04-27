import "../../styles/css/admin/adminEngagementStyle.css";
import { useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import { exportTabularPdf } from "../../utils/exportTabularPdf";

export default function AdminEngagement() {
  const { reviews, promos, createPromo, updatePromo } = useAdminData();
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [editingPromoId, setEditingPromoId] = useState("");
  const [promoForm, setPromoForm] = useState({
    title: "",
    status: "Draft",
    message: "",
    discountPercent: "",
    maxUsagePerUser: "",
    expiryMode: "none",
    expiresAt: "",
    usageLimit: "",
  });

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
      status: "Draft",
      message: "",
      discountPercent: "",
      maxUsagePerUser: "",
      expiryMode: "none",
      expiresAt: "",
      usageLimit: "",
    });
    setPromoError("");
  };

  const openEditPromoModal = (promo) => {
    setEditingPromoId(promo.id || "");
    setPromoForm({
      title: promo.title || "",
      status: promo.status === "Expired" ? "Active" : promo.status || "Draft",
      message: promo.message || "",
      discountPercent: String(Number(promo.discountPercent || 0) || ""),
      maxUsagePerUser: String(Number(promo.maxUsagePerUser || 0) || ""),
      expiryMode: promo.expiryMode || "none",
      expiresAt: promo.expiresAt ? new Date(promo.expiresAt).toISOString().slice(0, 16) : "",
      usageLimit: String(Number(promo.usageLimit || 0) || ""),
    });
    setPromoError("");
    setIsPromoModalOpen(true);
  };

  const exportReviewsPdf = () =>
    exportTabularPdf({
      title: "Admin Reviews Report",
      subtitle: "Customer feedback exported in tabular format.",
      sections: [
        {
          columns: ["Review ID", "Customer", "Rating", "Comment"],
          rows: reviews.map((review) => [
            review.id || "-",
            review.customer || "-",
            `${review.rating || 0}/5`,
            review.comment || "-",
          ]),
          emptyMessage: "No reviews yet.",
        },
      ],
    });

  const exportPromosPdf = () =>
    exportTabularPdf({
      title: "Admin Promos Report",
      subtitle: "Saved promos exported in tabular format.",
      sections: [
        {
          columns: ["Promo ID", "Title", "Discount", "Per User Limit", "Status", "Expiry", "Message"],
          rows: promos.map((promo) => [
            promo.id || "-",
            promo.title || "-",
            `${Number(promo.discountPercent || 0)}%`,
            Number(promo.maxUsagePerUser || 0) > 0 ? `${Number(promo.maxUsagePerUser || 0)} use(s)` : "-",
            promo.status || "-",
            getPromoExpiryLabel(promo),
            promo.message || "-",
          ]),
          emptyMessage: "No promos saved yet.",
        },
      ],
    });

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
            <div className="engTableHead"><div>Customer</div><div>Rating</div><div>Comment</div></div>
            {reviews.map((r) => (
              <div className="engTableRow" key={r.id}><div className="engClient">{r.customer}</div><div className="engRating">{stars(r.rating)}</div><div className="engComment">{r.comment}</div></div>
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
                  <div className="engMetaText">{Number(promo.discountPercent || 0)}% off</div>
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

      {isPromoModalOpen && (
        <div className="engModalOverlay" onMouseDown={(event) => {
          if (event.target.classList.contains("engModalOverlay")) {
            setIsPromoModalOpen(false);
            resetPromoForm();
          }
        }}>
          <div className="engModalCard" role="dialog" aria-modal="true">
            <div className="engModalHead">
              <div>
                <div className="engTitle">{editingPromoId ? "Edit Promo" : "Add Promo"}</div>
                <div className="engSub">{editingPromoId ? "Update the selected promo details." : "Create a new promo for staff and customers."}</div>
              </div>
              <button className="engModalClose" type="button" onClick={() => {
                setIsPromoModalOpen(false);
                resetPromoForm();
              }}>✕</button>
            </div>

            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setPromoError("");

                try {
                  if (editingPromoId) {
                    await updatePromo(editingPromoId, promoForm);
                  } else {
                    await createPromo(promoForm);
                  }
                  setIsPromoModalOpen(false);
                  resetPromoForm();
                } catch (error) {
                  setPromoError(error.message || `Failed to ${editingPromoId ? "update" : "create"} promo.`);
                }
              }}
              className="engModalBody"
            >
              <label className="engField">
                <span>Title</span>
                <input
                  value={promoForm.title}
                  onChange={(event) => setPromoForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Promo title"
                  required
                />
              </label>

              <label className="engField">
                <span>Discount Percentage</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={promoForm.discountPercent}
                  onChange={(event) => setPromoForm((prev) => ({ ...prev, discountPercent: event.target.value }))}
                  placeholder="e.g. 10"
                  required
                />
              </label>

              <div className="engFieldRow">
                <label className="engField">
                  <span>Max Usage Per User</span>
                  <input
                    type="number"
                    min="1"
                    value={promoForm.maxUsagePerUser}
                    onChange={(event) => setPromoForm((prev) => ({ ...prev, maxUsagePerUser: event.target.value }))}
                    placeholder="e.g. 1"
                    required
                  />
                </label>

                <label className="engField">
                  <span>Status</span>
                  <select
                    value={promoForm.status}
                    onChange={(event) => setPromoForm((prev) => ({ ...prev, status: event.target.value }))}
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
                      type="datetime-local"
                      value={promoForm.expiresAt}
                      onChange={(event) => setPromoForm((prev) => ({ ...prev, expiresAt: event.target.value }))}
                      required
                    />
                  </label>
                ) : promoForm.expiryMode === "usage" ? (
                  <label className="engField">
                    <span>Usage Limit</span>
                    <input
                      type="number"
                      min="1"
                      value={promoForm.usageLimit}
                      onChange={(event) => setPromoForm((prev) => ({ ...prev, usageLimit: event.target.value }))}
                      placeholder="Total allowed uses"
                      required
                    />
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
                  rows="5"
                  value={promoForm.message}
                  onChange={(event) => setPromoForm((prev) => ({ ...prev, message: event.target.value }))}
                  placeholder="Write the promo details..."
                  required
                />
              </label>

              {promoError ? <div className="engFieldError">{promoError}</div> : null}

              <div className="engModalActions">
                <button className="engBtnLight engBtnAuto" type="button" onClick={() => {
                  setIsPromoModalOpen(false);
                  resetPromoForm();
                }}>
                  Cancel
                </button>
                <button className="engBtnGold engBtnAuto" type="submit">
                  {editingPromoId ? "Update Promo" : "Save Promo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
