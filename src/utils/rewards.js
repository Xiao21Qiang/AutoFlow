export function formatCurrency(value) {
  return `P ${Number(value || 0).toLocaleString()}`;
}

export function isRewardExpired(reward) {
  const expirationDate = String(reward?.expirationDate || "").trim();
  if (!expirationDate) return false;
  return expirationDate < new Date().toISOString().slice(0, 10);
}

export function isRewardUsable(reward) {
  return String(reward?.status || "").trim().toLowerCase() === "unused" && !isRewardExpired(reward);
}

export function getCustomerRewards(customerRewards, currentUser) {
  const customerEmail = String(currentUser?.email || "").trim().toLowerCase();
  const customerName = String(currentUser?.name || "").trim().toLowerCase();
  return (customerRewards || []).filter((reward) => {
    const rewardEmail = String(reward.customerEmail || "").trim().toLowerCase();
    const rewardName = String(reward.customerName || "").trim().toLowerCase();
    return rewardEmail ? rewardEmail === customerEmail : rewardName === customerName;
  });
}

export function getUsableCustomerRewards(customerRewards, currentUser) {
  return getCustomerRewards(customerRewards, currentUser).filter(isRewardUsable);
}

export function parseRewardDiscount(value, amount) {
  const raw = String(value || "").trim();
  const baseAmount = Math.max(0, Number(amount || 0));
  if (!raw || baseAmount <= 0) return 0;

  const percentMatch = raw.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    const percent = Math.min(100, Math.max(0, Number(percentMatch[1]) || 0));
    return Math.min(baseAmount, Number(((baseAmount * percent) / 100).toFixed(2)));
  }

  const fixedMatch = raw.replace(/,/g, "").match(/(?:php|p|₱)?\s*(\d+(?:\.\d+)?)/i);
  if (fixedMatch && /discount|off|php|₱|p\s*\d/i.test(raw)) {
    return Math.min(baseAmount, Number((Number(fixedMatch[1]) || 0).toFixed(2)));
  }

  return 0;
}

export function getRewardPreview(reward, amount) {
  const discountAmount = parseRewardDiscount(reward?.rewardValue, amount);
  return {
    discountAmount,
    finalAmount: Math.max(0, Number((Number(amount || 0) - discountAmount).toFixed(2))),
  };
}

export function getPaymentRewardBreakdown(payment) {
  const rewardDiscountAmount = Number(payment?.rewardDiscountAmount || 0);
  const promoAdjustedAmount = Number(payment?.amount || 0) + rewardDiscountAmount;
  return {
    originalAmount: Number(payment?.originalAmount || promoAdjustedAmount || 0),
    rewardName: payment?.rewardName || "",
    rewardType: payment?.rewardType || "",
    rewardValue: payment?.rewardValue || "",
    rewardDiscountAmount,
    finalAmount: Number(payment?.amount || 0),
  };
}
