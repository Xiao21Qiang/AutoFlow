import "../../styles/css/staff/staffEngagementStyle.css";
import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import {
  canonicalRewardTypeToUiCategory,
  getRewardTypeSearchText,
} from "../../utils/rewardTypes";

function getRewardId(reward) {
  return String(reward?.id || reward?._id || "").trim();
}

function isRewardEnabled(reward) {
  return reward?.active === true ? true : reward?.enabled !== undefined ? Boolean(reward.enabled) : reward?.active !== false;
}

function formatRewardNumber(value) {
  return Number(value || 0).toLocaleString();
}

function getRewardStatusLabel(reward) {
  return reward?.archived ? "Archived" : isRewardEnabled(reward) ? "Enabled" : "Disabled";
}

function getRewardTypeLabel(reward) {
  return canonicalRewardTypeToUiCategory(reward?.rewardType || reward?.type) || reward?.rewardType || reward?.type || "-";
}

export default function StaffEngagement() {
  const { reviews, promos, rewards } = useAdminData();
  const [rewardFilters, setRewardFilters] = useState({ query: "", rarity: "", active: "" });
  const [selectedRewardId, setSelectedRewardId] = useState("");

  const filteredRewards = useMemo(() => {
    const query = rewardFilters.query.trim().toLowerCase();
    return (rewards || [])
      .filter((reward) => {
        const matchesQuery = !query || [
          reward.name,
          reward.code,
          getRewardTypeSearchText(reward.rewardType || reward.type),
          reward.description,
          reward.value,
          reward.rarity,
        ].join(" ").toLowerCase().includes(query);
        const matchesRarity = !rewardFilters.rarity || reward.rarity === rewardFilters.rarity;
        const matchesActive = !rewardFilters.active || getRewardStatusLabel(reward) === rewardFilters.active;
        return matchesQuery && matchesRarity && matchesActive;
      })
      .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
  }, [rewards, rewardFilters]);
  const selectedReward = (rewards || []).find((reward) => getRewardId(reward) === selectedRewardId);

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
              <div className="stEngSub">Saved promos - view only</div>
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
                  </tr>
                ))}
                {promos.length === 0 && (
                  <tr>
                    <td className="stEngEmptyCell" colSpan={4}>No promos saved yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="stEngCard stEngRewardCard">
        <div className="stEngHead">
          <div>
            <div className="stEngTitle">Reward Pool</div>
            <div className="stEngSub">Current reward definitions</div>
          </div>
        </div>
        <div className="stEngRewardFilters">
          <input value={rewardFilters.query} onChange={(event) => setRewardFilters((prev) => ({ ...prev, query: event.target.value }))} placeholder="Search reward" />
          <select value={rewardFilters.rarity} onChange={(event) => setRewardFilters((prev) => ({ ...prev, rarity: event.target.value }))}>
            <option value="">All rarity</option>
            <option>Common</option>
            <option>Uncommon</option>
            <option>Rare</option>
          </select>
          <select value={rewardFilters.active} onChange={(event) => setRewardFilters((prev) => ({ ...prev, active: event.target.value }))}>
            <option value="">All status</option>
            <option>Enabled</option>
            <option>Disabled</option>
            <option>Archived</option>
          </select>
        </div>
        <div className="stEngTableWrap stEngRewardTableWrap">
          <table className="stEngTbl stEngRewardTbl">
            <thead>
              <tr>
                <th>Reward</th>
                <th>Type</th>
                <th>Value</th>
                <th>Rarity</th>
                <th>Weight</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredRewards.map((reward) => (
                <tr key={getRewardId(reward) || reward.code || reward.name}>
                  <td className="stEngPromoTitle">{reward.name}</td>
                  <td>{getRewardTypeLabel(reward)}</td>
                  <td>{reward.value || "-"}</td>
                  <td>{reward.rarity || "-"}</td>
                  <td>{formatRewardNumber(reward.weight)}</td>
                  <td>
                    <span className={`stEngPromoBadge ${isRewardEnabled(reward) ? "active" : reward.archived ? "expired" : "draft"}`}>
                      {getRewardStatusLabel(reward)}
                    </span>
                  </td>
                  <td>
                    <button className="stEngUseBtn" type="button" onClick={() => setSelectedRewardId(getRewardId(reward))}>View Details</button>
                  </td>
                </tr>
              ))}
              {filteredRewards.length === 0 && (
                <tr>
                  <td className="stEngEmptyCell" colSpan={7}>No rewards found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedReward && (
        <div className="stEngModalOverlay" onMouseDown={(event) => { if (event.target.classList.contains("stEngModalOverlay")) setSelectedRewardId(""); }}>
          <div className="stEngModalCard" role="dialog" aria-modal="true" aria-labelledby="staff-reward-details-title">
            <button className="stEngModalClose" type="button" onClick={() => setSelectedRewardId("")}>x</button>
            <div className="stEngTitle" id="staff-reward-details-title">Reward Details</div>
            <div className="stEngRewardDetails">
              <div><span>Reward Name</span><strong>{selectedReward.name || "-"}</strong></div>
              <div><span>Code</span><strong>{selectedReward.code || "-"}</strong></div>
              <div><span>Type</span><strong>{getRewardTypeLabel(selectedReward)}</strong></div>
              <div><span>Description</span><strong>{selectedReward.description || "-"}</strong></div>
              <div><span>Value</span><strong>{selectedReward.value || "-"}</strong></div>
              <div><span>Discount Type</span><strong>{selectedReward.discountType || "-"}</strong></div>
              <div><span>Discount Value</span><strong>{formatRewardNumber(selectedReward.discountValue)}</strong></div>
              <div><span>Rarity</span><strong>{selectedReward.rarity || "-"}</strong></div>
              <div><span>Weight</span><strong>{formatRewardNumber(selectedReward.weight)}</strong></div>
              <div><span>Stock</span><strong>{formatRewardNumber(selectedReward.stock || selectedReward.quantity)}</strong></div>
              <div><span>Expiration Days</span><strong>{formatRewardNumber(selectedReward.expirationDays)}</strong></div>
              <div><span>Status</span><strong>{getRewardStatusLabel(selectedReward)}</strong></div>
            </div>
            <div className="stEngModalActions">
              <button className="stEngUseBtn" type="button" onClick={() => setSelectedRewardId("")}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
