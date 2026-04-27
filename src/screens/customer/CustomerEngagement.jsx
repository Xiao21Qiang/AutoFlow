import "../../styles/css/customer/customerEngagementStyle.css";

import { useEffect, useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";

const stars = (n = 0) => "★★★★★".slice(0, Math.max(0, Math.min(5, n)));

export default function CustomerEngagement({ initialAction = null, onActionHandled }) {
  const { reviews, promos, currentUser, createReview } = useAdminData();
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
      reviews.filter((review) => {
        const reviewEmail = String(review.customerEmail || "").trim().toLowerCase();
        const reviewName = String(review.customer || "").trim().toLowerCase();
        if (customerEmail && reviewEmail) {
          return reviewEmail === customerEmail;
        }
        return reviewName === customerName;
      }),
    [reviews, customerEmail, customerName]
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ rating: 5, comment: "" });
  const [hoverRating, setHoverRating] = useState(0);
  const activePromos = useMemo(
    () => promos.filter((promo) => String(promo.status || "").trim().toLowerCase() === "active"),
    [promos]
  );

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

            <button className="clEngAddBtn" type="button" onClick={() => setIsModalOpen(true)}>
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
                  await createReview({
                    customer: currentUser?.name || "Customer",
                    customerEmail: currentUser?.email || "",
                    rating: Number(form.rating),
                    comment: form.comment,
                  });
                  setForm({ rating: 5, comment: "" });
                  setIsModalOpen(false);
                } catch (error) {
                  window.alert(error.message || "Failed to submit review.");
                }
              }}
            >
              <div className="clSvcModalTitle">Add Review</div>
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
                        className={`clReviewStarBtn${active ? " active" : ""}`}
                        aria-label={`${star} star${star > 1 ? "s" : ""}`}
                        aria-checked={Number(form.rating) === star}
                        onMouseEnter={() => setHoverRating(star)}
                        onFocus={() => setHoverRating(star)}
                        onClick={() => setForm((prev) => ({ ...prev, rating: star }))}
                      >
                        ★
                      </button>
                    );
                  })}
                </div>
                <div className="clReviewStarText">{Number(form.rating)} out of 5 stars</div>
              </label>
              <label className="clSvcField">
                <span>Comment</span>
                <textarea
                  rows="4"
                  value={form.comment}
                  onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))}
                  placeholder="Share your experience..."
                  required
                />
              </label>
              <div className="clSvcModalActions">
                <button className="clSvcTextBtn" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button className="clSvcPrimaryBtn" type="submit">
                  Submit Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
