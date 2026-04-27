import "../../styles/css/staff/staffEngagementStyle.css";
import { useAdminData } from "../../context/AdminDataContext";

export default function StaffEngagement() {
  const { reviews, promos, usePromo } = useAdminData();
  const getPromoMeta = (promo) => {
    const expiryMode = String(promo.expiryMode || "none").trim().toLowerCase();
    if (expiryMode === "date" && promo.expiresAt) {
      return `Expires ${new Date(promo.expiresAt).toLocaleString("en-PH")}`;
    }
    if (expiryMode === "usage") {
      const used = Number(promo.usageCount || 0);
      const limit = Number(promo.usageLimit || 0);
      return `Used ${used}/${limit}`;
    }
    return "No automatic expiry";
  };

  const stars = (n) => {
    const x = Math.max(0, Math.min(5, Number(n) || 0));
    return "★".repeat(x) + "☆".repeat(5 - x);
  };

  return (
    <div className="stEngWrap">
      <div className="stEngGrid">
        <div className="stEngCard">
          <div className="stEngHead">
            <div>
              <div className="stEngTitle">Reviews</div>
              <div className="stEngSub">Customer feedback</div>
            </div>
          </div>

          <div className="stEngTableWrap">
            <table className="stEngTbl">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Rating</th>
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id}>
                    <td>{r.customer}</td>
                    <td>{stars(r.rating)}</td>
                    <td>{r.comment}</td>
                  </tr>
                ))}
                {reviews.length === 0 && (
                  <tr>
                    <td colSpan={3}>No reviews yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stEngCard">
          <div className="stEngHead">
            <div>
              <div className="stEngTitle">Promos</div>
              <div className="stEngSub">Saved promos</div>
            </div>
          </div>

          <div className="stEngTableWrap">
            <table className="stEngTbl">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Expiry</th>
                  <th>Message</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {promos.map((promo) => (
                  <tr key={promo.id}>
                    <td className="stEngPromoTitle">{promo.title}</td>
                    <td>
                      <span className={`stEngPromoBadge ${
                        String(promo.status || "").trim().toLowerCase() === "active"
                          ? "active"
                          : String(promo.status || "").trim().toLowerCase() === "expired"
                            ? "expired"
                            : "draft"
                      }`}>
                        {promo.status || "-"}
                      </span>
                    </td>
                    <td>{getPromoMeta(promo)}</td>
                    <td>{promo.message}</td>
                    <td>
                      <button
                        className="stEngUseBtn"
                        type="button"
                        onClick={() => usePromo(promo.id)}
                        disabled={String(promo.status || "").trim().toLowerCase() !== "active"}
                      >
                        Use Promo
                      </button>
                    </td>
                  </tr>
                ))}
                {promos.length === 0 && (
                  <tr>
                    <td className="stEngEmptyCell" colSpan={5}>No promos saved yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
