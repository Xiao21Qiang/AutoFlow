import "../../styles/css/customer/customerEngagementStyle.css";

import { useEffect, useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import { getRewardStatus } from "../../utils/rewards";

const stars = (n = 0) => "★★★★★".slice(0, Math.max(0, Math.min(5, n)));

export default function CustomerEngagement({ initialAction = null, onActionHandled }) {
  const { bookings, payments, reviews, promos, rewards, customerRewards, currentUser, createReview, claimReward } = useAdminData();
  const safeBookings = useMemo(() => (Array.isArray(bookings) ? bookings : []), [bookings]);
  const safePayments = useMemo(() => (Array.isArray(payments) ? payments : []), [payments]);
  const safeReviews = useMemo(() => (Array.isArray(reviews) ? reviews : []), [reviews]);
  const safePromos = useMemo(() => (Array.isArray(promos) ? promos : []), [promos]);
  const safeCustomerRewards = useMemo(() => (Array.isArray(customerRewards) ? customerRewards : []), [customerRewards]);
  const getPromoMeta = (promo) => {
    const expiryMode = String(promo.expiryMode || "none").trim().toLowerCase();
    if (expiryMode === "date" && promo.expiresAt) {
      return `Valid until ${new Date(promo.expiresAt).toLocaleString("en-PH")}`;
    }
    if (expiryMode === "usage") {
      const remaining = Number(promo.remainingUses);
      return `${remaining} use${remaining === 1 ? "" : "s"} remaining`;
    }
    return "Available while active";
  };
  const customerName = String(currentUser?.name || "").trim().toLowerCase();
  const customerEmail = String(currentUser?.email || "").trim().toLowerCase();
  const customerReviews = useMemo(
    () =>
      safeReviews.filter((review) => {
        const reviewEmail = String(review.customerEmail || "").trim().toLowerCase();
        const reviewName = String(review.customer || "").trim().toLowerCase();
        if (customerEmail && reviewEmail) {
          return reviewEmail === customerEmail;
        }
        return reviewName === customerName;
      }),
    [safeReviews, customerEmail, customerName]
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ bookingId: "", rating: 5, comment: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);
  const activePromos = useMemo(
    () => safePromos.filter((promo) => String(promo.status || "").trim().toLowerCase() === "active"),
    [safePromos]
  );
  const myRewards = useMemo(
    () => safeCustomerRewards.filter((reward) => {
      const rewardEmail = String(reward.customerEmail || "").trim().toLowerCase();
      const rewardName = String(reward.customerName || "").trim().toLowerCase();
      return rewardEmail ? rewardEmail === customerEmail : rewardName === customerName;
    }),
    [safeCustomerRewards, customerEmail, customerName]
  );
  const activeRewardDefinitionIds = useMemo(
    () => new Set((rewards || []).filter((reward) => reward.active !== false && reward.enabled !== false && !reward.archived).map((reward) => String(reward.id || "").trim())),
    [rewards]
  );
  const eligibleReviewBookings = useMemo(() => {
    const reviewedBookingIds = new Set(
      customerReviews
        .filter((review) => String(review.status || "Published").trim().toLowerCase() !== "archived")
        .map((review) => String(review.bookingId || "").trim())
        .filter(Boolean)
    );
    return safeBookings.filter((booking) => {
      if (String(booking.status || "").trim().toLowerCase() !== "completed") return false;
      if (reviewedBookingIds.has(String(booking.id || "").trim())) return false;
      const payment = safePayments.find((item) => String(item.bookingId || "").trim() === String(booking.id || "").trim());
      return payment?.invoice ? Number(payment.invoice.outstandingBalance || 0) <= 0 && Number(payment.invoice.finalAmountDue || 0) > 0 : false;
    });
  }, [safeBookings, safePayments, customerReviews]);

  useEffect(() => {
    if (initialAction !== "open-add-review") return;
    setIsModalOpen(true);
    onActionHandled?.();
  }, [initialAction, onActionHandled]);

  return (
    <div className="clEngWrap">
      <div className="clEngGrid">
        <div className="clEngCard">
          <div className="clEngHead">
            <div>
              <div className="clEngTitle">Reviews</div>
              <div className="clEngSub">Add feedback</div>
            </div>

            <button className="clEngAddBtn" type="button" disabled={!eligibleReviewBookings.length} onClick={() => {
              setFieldErrors({});
              setIsModalOpen(true);
            }}>
              Add Review
            </button>
          </div>

          <div className="clEngTable">
            <div className="clEngTableHead">
              <div>Customer</div>
              <div>Rating</div>
              <div>Comment</div>
            </div>

            {customerReviews.length === 0 ? (
              <div className="clEngTableRow clEngTableRowFirst">
                <div>{currentUser?.name || "Customer"}</div>
                <div>-</div>
                <div>No review submitted yet.</div>
              </div>
            ) : (
              customerReviews.map((review) => (
                <div key={review.id} className="clEngTableRow clEngTableRowFirst">
                  <div>{review.customer}</div>
                  <div>{stars(review.rating)}</div>
                  <div>{review.comment}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="clEngCard">
          <div className="clEngHead">
            <div>
              <div className="clEngTitle">Promos</div>
              <div className="clEngSub">Active promos</div>
            </div>
          </div>

          <div className="clEngTable clEngPromoTable">
            <div className="clEngTableHead clEngPromoHead">
              <div>Title</div>
              <div>Status</div>
              <div>Message</div>
            </div>

            {activePromos.length === 0 ? (
              <div className="clEngEmptyRow">No active promos yet.</div>
            ) : (
              activePromos.map((promo) => (
                <div key={promo.id} className="clEngTableRow clEngPromoRow">
                  <div className="clEngPromoTitle">{promo.title}</div>
                  <div>
                    <span className="clEngPromoBadge">Active</span>
                  </div>
                  <div>
                    <div>{promo.message}</div>
                    <div className="clEngPromoMeta">{getPromoMeta(promo)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="clEngCard">
          <div className="clEngHead">
            <div>
              <div className="clEngTitle">Rewards</div>
              <div className="clEngSub">Available, used, and expired claims</div>
            </div>
          </div>
          <div className="clEngTable clEngPromoTable">
            <div className="clEngTableHead clEngPromoHead">
              <div>Reward</div>
              <div>Status</div>
              <div>Claim</div>
            </div>
            {myRewards.length === 0 ? (
              <div className="clEngEmptyRow">No rewards earned yet.</div>
            ) : (
              myRewards.map((reward) => {
                const rewardDefinitionActive = activeRewardDefinitionIds.has(String(reward.rewardId || "").trim());
                const rewardStatus = getRewardStatus(reward);
                const displayStatus = rewardStatus === "Available" && !rewardDefinitionActive ? "Unavailable" : rewardStatus;
                return (
                  <div key={reward.id} className="clEngTableRow clEngPromoRow">
                    <div className="clEngPromoTitle">{reward.rewardName}<div className="clEngPromoMeta">{reward.rewardValue || reward.rewardType}</div></div>
                    <div><span className="clEngPromoBadge">{displayStatus}</span></div>
                    <div>
                      <div>{reward.claimCode || "-"}</div>
                      <div className="clEngPromoMeta">{reward.expirationDate ? `Expires ${reward.expirationDate}` : "No expiration date"}</div>
                      {rewardStatus === "Available" && rewardDefinitionActive ? (
                        <button className="clEngAddBtn" type="button" onClick={() => claimReward?.(reward.id)}>
                          Claim
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="clSvcModalOverlay" onClick={() => setIsModalOpen(false)}>
          <div className="clSvcModalCard" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="clSvcModalClose" type="button" onClick={() => setIsModalOpen(false)}>
              x
            </button>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const errors = {};
                  if (!form.bookingId) errors.bookingId = "Select a completed booking.";
                  if (!Number.isInteger(Number(form.rating)) || Number(form.rating) < 1 || Number(form.rating) > 5) {
                    errors.rating = "Rating must be a whole number from 1 to 5.";
                  }
                  if (String(form.comment || "").trim().length < 3) {
                    errors.comment = "Review comment must be at least 3 characters.";
                  }
                  setFieldErrors(errors);
                  if (Object.keys(errors).length) return;

                  setIsSubmittingReview(true);
                  await createReview({
                    bookingId: form.bookingId,
                    rating: Number(form.rating),
                    comment: form.comment,
                  });
                  setForm({ bookingId: "", rating: 5, comment: "" });
                  setFieldErrors({});
                  setIsModalOpen(false);
                } catch (error) {
                  if (error.errors && Object.keys(error.errors).length) {
                    setFieldErrors(error.errors);
                  } else if (error.field) {
                    setFieldErrors({ [error.field]: error.message || "Please check this field." });
                  } else {
                    setFieldErrors({ form: error.message || "Failed to submit review." });
                  }
                } finally {
                  setIsSubmittingReview(false);
                }
              }}
            >
              <div className="clSvcModalTitle">Add Review</div>
              {!eligibleReviewBookings.length ? (
                <div className="clEngReviewEmpty">No completed and fully paid bookings are ready for review.</div>
              ) : null}
              <label className="clSvcField">
                <span>Booking</span>
                <select
                  value={form.bookingId}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, bookingId: e.target.value }));
                    setFieldErrors((prev) => ({ ...prev, bookingId: "", form: "" }));
                  }}
                  disabled={!eligibleReviewBookings.length}
                  required
                >
                  <option value="">Select completed booking</option>
                  {eligibleReviewBookings.map((booking) => (
                    <option key={booking.id} value={booking.id}>
                      {booking.id} - {booking.service} - {booking.date || "Completed"}
                    </option>
                  ))}
                </select>
                {fieldErrors.bookingId && <div className="clEngFieldError">{fieldErrors.bookingId}</div>}
              </label>
              <label className="clSvcField">
                <span>Rating</span>
                <div
                  className="clReviewStars"
                  role="radiogroup"
                  aria-label="Rating"
                  onMouseLeave={() => setHoverRating(0)}
                >
                  {[1, 2, 3, 4, 5].map((star) => {
                    const active = star <= (hoverRating || Number(form.rating));
                    return (
                      <button
                        key={star}
                        type="button"
                        role="radio"
                        className={`clReviewStarBtn${active ? " active" : ""}`}
                        aria-label={`${star} star${star > 1 ? "s" : ""}`}
                        aria-checked={Number(form.rating) === star}
                        onMouseEnter={() => setHoverRating(star)}
                        onFocus={() => setHoverRating(star)}
                        disabled={!eligibleReviewBookings.length}
                        onClick={() => {
                          setForm((prev) => ({ ...prev, rating: star }));
                          setFieldErrors((prev) => ({ ...prev, rating: "", form: "" }));
                        }}
                      >
                        ★
                      </button>
                    );
                  })}
                </div>
                <div className="clReviewStarText">{Number(form.rating)} out of 5 stars</div>
                {fieldErrors.rating && <div className="clEngFieldError">{fieldErrors.rating}</div>}
              </label>
              <label className="clSvcField">
                <span>Comment</span>
                <textarea
                  rows="4"
                  value={form.comment}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, comment: e.target.value }));
                    setFieldErrors((prev) => ({ ...prev, comment: "", form: "" }));
                  }}
                  placeholder="Share your experience..."
                  disabled={!eligibleReviewBookings.length}
                  required
                />
                {fieldErrors.comment && <div className="clEngFieldError">{fieldErrors.comment}</div>}
              </label>
              {fieldErrors.form && <div className="clEngFieldError">{fieldErrors.form}</div>}
              <div className="clSvcModalActions">
                <button className="clSvcTextBtn" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button className="clSvcPrimaryBtn" type="submit" disabled={!eligibleReviewBookings.length || isSubmittingReview}>
                  {isSubmittingReview ? "Submitting..." : "Submit Review"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
