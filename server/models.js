const mongoose = require("mongoose");

const SERVICE_ARRIVAL_TIME_OPTIONS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
];

const markerSchema = new mongoose.Schema(
  {
    id: Number,
    x: Number,
    y: Number,
    issueType: { type: String, default: "" },
  },
  { _id: false }
);

const warrantyChecklistItemSchema = new mongoose.Schema(
  {
    id: { type: String, default: "" },
    label: { type: String, default: "" },
    done: { type: Boolean, default: false },
    doneBy: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const warrantyAcknowledgementSchema = new mongoose.Schema(
  {
    dateLocation: { type: String, default: "" },
    carModelYearColor: { type: String, default: "" },
    plateCsNumber: { type: String, default: "" },
    serviceAvailed: { type: String, default: "" },
    clientName: { type: String, default: "" },
    clientSignature: { type: String, default: "" },
  },
  { _id: false }
);

const servicePriceBySizeSchema = new mongoose.Schema(
  {
    sedanSmallCar: { type: Number, default: 0 },
    midsizePickupMpv: { type: Number, default: 0 },
    suv: { type: Number, default: 0 },
    xlVanSemiTruck: { type: Number, default: 0 },
  },
  { _id: false }
);

const serviceConsumableBySizeSchema = new mongoose.Schema(
  {
    sedanSmallCar: { type: Number, default: 0 },
    midsizePickupMpv: { type: Number, default: 0 },
    suv: { type: Number, default: 0 },
    xlVanSemiTruck: { type: Number, default: 0 },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    customer: { type: String, default: "" },
    customerEmail: { type: String, default: "" },
    customerId: { type: String, default: "" },
    bookingSource: { type: String, default: "" },
    customerRequested: { type: Boolean, default: false },
    createdByUserType: { type: String, default: "" },
    vehicle: { type: String, default: "" },
    carSize: { type: String, default: "" },
    plate: { type: String, default: "" },
    service: { type: String, default: "" },
    serviceId: { type: String, default: "" },
    assigned: { type: String, default: "" },
    assignedDetailerId: { type: String, default: "" },
    preferredDetailer: { type: String, default: "" },
    preferredDetailerName: { type: String, default: "" },
    preferredDetailerId: { type: String, default: "" },
    date: { type: String, default: "" },
    time: { type: String, default: "" },
    placeSlot: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    originalAmount: { type: Number, default: 0 },
    promoId: { type: String, default: "" },
    promoCode: { type: String, default: "" },
    promoTitle: { type: String, default: "" },
    promoDiscountType: { type: String, default: "" },
    promoDiscountValue: { type: Number, default: 0 },
    promoDiscountPercent: { type: Number, default: 0 },
    promoDiscountAmount: { type: Number, default: 0 },
    rewardId: { type: String, default: "" },
    rewardName: { type: String, default: "" },
    rewardType: { type: String, default: "" },
    rewardDiscountType: { type: String, default: "" },
    rewardValue: { type: String, default: "" },
    rewardClaimCode: { type: String, default: "" },
    rewardDiscountAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    subtotalAfterDiscount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    finalAmount: { type: Number, default: 0 },
    status: { type: String, default: "Scheduled" },
    consumablesApplied: { type: Boolean, default: false },
    issueNote: { type: String, default: "" },
    issueTypes: { type: [String], default: [] },
    issueMarkers: { type: [markerSchema], default: [] },
    warrantyChecklist: { type: String, default: "" },
    warrantyChecklistItems: { type: [warrantyChecklistItemSchema], default: [] },
    warrantyCoveragePackage: { type: String, default: "" },
    warrantyAcknowledgement: { type: warrantyAcknowledgementSchema, default: () => ({}) },
    warrantyReleased: { type: Boolean, default: false },
    warrantyReleasedAt: { type: String, default: "" },
    warrantyQrCode: { type: String, default: "" },
    trackingAccessVersion: { type: Number, default: 1 },
    warrantyAccessVersion: { type: Number, default: 1 },
    trackingAccessRevoked: { type: Boolean, default: false },
    warrantyAccessRevoked: { type: Boolean, default: false },
    trackingAccessRotatedAt: { type: String, default: "" },
    warrantyAccessRotatedAt: { type: String, default: "" },
    cancellationReason: { type: String, default: "" },
    cancellationCode: { type: String, default: "" },
    cancelReason: { type: String, default: "" },
    autoCancelledForNoDownPaymentProof: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

const serviceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, default: "" },
    desc: { type: String, default: "" },
    serviceType: { type: String, default: "Basic Service" },
    category: { type: String, default: "" },
    price: { type: Number, default: 0 },
    priceBySize: { type: servicePriceBySizeSchema, default: () => ({}) },
    mins: { type: Number, default: 0 },
    allowedArrivalTimes: { type: [{ type: String, enum: SERVICE_ARRIVAL_TIME_OPTIONS }], default: [] },
    enabled: { type: Boolean, default: true },
    consumables: { type: [String], default: [] },
    consumablesBySize: {
      type: Map,
      of: serviceConsumableBySizeSchema,
      default: () => ({}),
    },
  },
  { timestamps: true, versionKey: false }
);

const restockHistorySchema = new mongoose.Schema(
  {
    date: { type: String, default: "" },
    time: { type: String, default: "" },
    qtyToAdd: { type: Number, default: 0 },
    restockedBy: { type: String, default: "" },
    costPerUnit: { type: Number, default: 0 },
    supplier: { type: String, default: "" },
    notes: { type: String, default: "" },
    restockedAt: { type: String, default: "" },
  },
  { _id: false }
);

const stockMonitoringItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, default: "" },
    category: { type: String, default: "" },
    currentStock: { type: Number, default: 0, min: 0 },
    maxStock: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: undefined, min: 0 },
    pricePerUnit: { type: Number, default: 0 },
    lastRestocked: { type: String, default: "" },
    restockHistory: { type: [restockHistorySchema], default: [] },
  },
  { timestamps: true, versionKey: false, collection: "stockmonitoringitems" }
);

const paymentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    bookingId: { type: String, default: "" },
    date: { type: String, default: "" },
    customer: { type: String, default: "" },
    customerEmail: { type: String, default: "" },
    service: { type: String, default: "" },
    serviceId: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    originalAmount: { type: Number, default: 0 },
    promoId: { type: String, default: "" },
    promoCode: { type: String, default: "" },
    promoTitle: { type: String, default: "" },
    promoDiscountType: { type: String, default: "" },
    promoDiscountValue: { type: Number, default: 0 },
    promoDiscountPercent: { type: Number, default: 0 },
    promoDiscountAmount: { type: Number, default: 0 },
    rewardId: { type: String, default: "" },
    rewardName: { type: String, default: "" },
    rewardType: { type: String, default: "" },
    rewardDiscountType: { type: String, default: "" },
    rewardValue: { type: String, default: "" },
    rewardClaimCode: { type: String, default: "" },
    rewardDiscountAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    subtotalAfterDiscount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    finalAmount: { type: Number, default: 0 },
    status: { type: String, default: "Pending" },
    method: { type: String, default: "" },
    reference: { type: String, default: "" },
    notes: { type: String, default: "" },
    proofSubmittedAt: { type: String, default: "" },
    proofImage: { type: String, default: "" },
    proofFileName: { type: String, default: "" },
    reviewedAt: { type: String, default: "" },
    reviewedBy: { type: String, default: "" },
    downPaymentRequired: { type: Boolean, default: false },
    downPaymentAmount: { type: Number, default: 0 },
    downPaymentStatus: { type: String, default: "Not Required" },
    downPaymentMethod: { type: String, default: "" },
    downPaymentReference: { type: String, default: "" },
    downPaymentProofUrl: { type: String, default: "" },
    downPaymentProofName: { type: String, default: "" },
    downPaymentProofSubmittedAt: { type: Date, default: null },
    downPaymentFirstSubmittedAt: { type: Date, default: null },
    downPaymentCorrectionSubmittedAt: { type: Date, default: null },
    downPaymentSubmissionClosed: { type: Boolean, default: false },
    downPaymentSubmissionClosedAt: { type: Date, default: null },
    downPaymentClosureReasonCode: { type: String, default: "" },
    downPaymentCorrectionDueAt: { type: Date, default: null },
    downPaymentNoSubmissionStrikeRecordedAt: { type: Date, default: null },
    downPaymentReferenceCheckStatus: { type: String, default: "" },
    downPaymentReferenceCheckedAt: { type: Date, default: null },
    downPaymentOcrAdvisoryStatus: { type: String, default: "" },
    downPaymentOcrAdvisoryText: { type: String, default: "" },
    downPaymentOcrDetectedReference: { type: String, default: "" },
    downPaymentPossibleDuplicateReference: { type: Boolean, default: false },
    downPaymentReviewStatus: { type: String, default: "" },
    downPaymentVerifiedAt: { type: Date, default: null },
    downPaymentVerifiedBy: { type: String, default: "" },
    downPaymentRejectedAt: { type: Date, default: null },
    downPaymentRejectedBy: { type: String, default: "" },
    downPaymentRejectionReason: { type: String, default: "" },
    downPaymentNotes: { type: String, default: "" },
    downPaymentDueAt: { type: Date, default: null },
    downPaymentReminderSentAt: { type: Date, default: null },
    downPaymentFinalReminderSentAt: { type: Date, default: null },
    downPaymentExpiredAt: { type: Date, default: null },
    downPaymentVerifiedNotificationSentAt: { type: Date, default: null },
    autoCancelledForNoDownPaymentProof: { type: Boolean, default: false },
    cancellationReason: { type: String, default: "" },
    cancellationCode: { type: String, default: "" },
    totalAmount: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    remainingBalance: { type: Number, default: 0 },
    finalPaymentStatus: { type: String, default: "Pending" },
    finalPaymentMethod: { type: String, default: "" },
    finalPaymentReference: { type: String, default: "" },
    finalPaymentProofUrl: { type: String, default: "" },
    finalPaymentProofName: { type: String, default: "" },
    finalPaymentProofSubmittedAt: { type: Date, default: null },
    finalPaymentReferenceCheckStatus: { type: String, default: "" },
    finalPaymentReferenceCheckedAt: { type: Date, default: null },
    finalPaymentOcrAdvisoryStatus: { type: String, default: "" },
    finalPaymentOcrAdvisoryText: { type: String, default: "" },
    finalPaymentOcrDetectedReference: { type: String, default: "" },
    finalPaymentPossibleDuplicateReference: { type: Boolean, default: false },
    finalPaymentReviewStatus: { type: String, default: "" },
    finalPaymentVerifiedAt: { type: Date, default: null },
    finalPaymentVerifiedBy: { type: String, default: "" },
    finalPaymentRejectedAt: { type: Date, default: null },
    finalPaymentRejectedBy: { type: String, default: "" },
    finalPaymentRejectionReason: { type: String, default: "" },
    finalPaymentNotes: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false }
);

const customerCarSchema = new mongoose.Schema(
  {
    brand: { type: String, default: "" },
    vehicle: { type: String, default: "" },
    size: { type: String, default: "" },
    plate: { type: String, default: "" },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, default: "" },
    first: { type: String, default: "" },
    last: { type: String, default: "" },
    userType: { type: String, default: "Customer" },
    role: { type: String, default: "New" },
    email: { type: String, required: true, unique: true },
    phone: { type: String, default: "" },
    password: { type: String, default: "" },
    status: { type: String, default: "active" },
    deactivatedAt: { type: String, default: "" },
    deactivatedBy: { type: String, default: "" },
    deletedAt: { type: String, default: "" },
    deletedBy: { type: String, default: "" },
    deletionMode: { type: String, default: "" },
    cars: { type: [customerCarSchema], default: [] },
    noDownPaymentTimeoutStreak: { type: Number, default: 0 },
    bookingCooldownUntil: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

const auditLogSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, default: "system" },
    action: { type: String, default: "" },
    targetId: { type: String, default: "" },
    ts: { type: String, default: "" },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    archived: { type: Boolean, default: false },
    archivedAt: { type: String, default: "" },
    archivedBy: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false }
);

const reviewSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    customerId: { type: String, default: "" },
    customer: { type: String, default: "" },
    customerEmail: { type: String, default: "" },
    bookingId: { type: String, default: "" },
    serviceId: { type: String, default: "" },
    serviceName: { type: String, default: "" },
    rating: { type: Number, default: 5 },
    comment: { type: String, default: "" },
    bookingStatusSnapshot: { type: String, default: "" },
    paymentEligibilitySnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, default: "Pending" },
    moderatedAt: { type: String, default: "" },
    moderatedBy: { type: String, default: "" },
    moderationReason: { type: String, default: "" },
    adminResponse: { type: String, default: "" },
    adminResponseAt: { type: String, default: "" },
    archived: { type: Boolean, default: false },
    archivedAt: { type: String, default: "" },
    archivedBy: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false }
);
reviewSchema.index(
  { bookingId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      bookingId: { $exists: true, $type: "string", $ne: "" },
      status: { $nin: ["Archived"] },
    },
  }
);

const promoSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, default: "" },
    name: { type: String, default: "" },
    code: { type: String, default: "" },
    message: { type: String, default: "" },
    description: { type: String, default: "" },
    status: { type: String, default: "Draft" },
    enabled: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    scheduledFor: { type: String, default: "" },
    startAt: { type: String, default: "" },
    endAt: { type: String, default: "" },
    expiryMode: { type: String, default: "none" },
    expiresAt: { type: String, default: "" },
    usageLimit: { type: Number, default: 0 },
    usageCount: { type: Number, default: 0 },
    maxUsagePerUser: { type: Number, default: 0 },
    discountType: { type: String, default: "Percentage" },
    discountValue: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    applicableServiceIds: { type: [String], default: [] },
    archivedAt: { type: String, default: "" },
    archivedBy: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false }
);
promoSchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: {
      code: { $exists: true, $type: "string", $ne: "" },
    },
  }
);

const expenseSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    date: { type: String, default: "" },
    description: { type: String, default: "" },
    note: { type: String, default: "" },
    category: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    paidBy: { type: String, default: "" },
    sourceType: { type: String, default: "" },
    sourceId: { type: String, default: "" },
    archived: { type: Boolean, default: false },
    archivedAt: { type: String, default: "" },
    archivedBy: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false }
);

const commissionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    bookingId: { type: String, default: "" },
    employeeId: { type: String, default: "" },
    date: { type: String, default: "" },
    worker: { type: String, default: "" },
    role: { type: String, default: "" },
    service: { type: String, default: "" },
    serviceValue: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    earned: { type: Number, default: 0 },
    status: { type: String, default: "Pending" },
    generatedBy: { type: String, default: "" },
    remarks: { type: String, default: "" },
    dateCompleted: { type: String, default: "" },
    dateGenerated: { type: String, default: "" },
    datePaid: { type: String, default: "" },
    paidBy: { type: String, default: "" },
    voidReason: { type: String, default: "" },
    voidedAt: { type: String, default: "" },
    voidedBy: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false }
);

const quoteRequestSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    fullName: { type: String, default: "" },
    phone: { type: String, default: "" },
    vehicleType: { type: String, default: "" },
    carSize: { type: String, default: "" },
    service: { type: String, default: "" },
    estimatedAmount: { type: Number, default: 0 },
    estimateLabel: { type: String, default: "" },
    message: { type: String, default: "" },
    status: { type: String, default: "Under Review" },
    source: { type: String, default: "landing-page" },
  },
  { timestamps: true, versionKey: false }
);

const securitySettingSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    adminSpecialPinHash: { type: String, default: "" },
    adminSpecialPasswordHash: { type: String, default: "" },
    staffSpecialPinHash: { type: String, default: "" },
    staffSpecialPasswordHash: { type: String, default: "" },
    requiredDownPaymentAmount: { type: Number, default: 0 },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false }
);

const rewardSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, default: "" },
    code: { type: String, default: "" },
    type: { type: String, default: "Voucher" },
    rewardType: { type: String, default: "" },
    description: { type: String, default: "" },
    value: { type: String, default: "" },
    discountType: { type: String, default: "" },
    discountValue: { type: Number, default: 0 },
    rarity: { type: String, default: "Common" },
    weight: { type: Number, default: 10 },
    enabled: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    archived: { type: Boolean, default: false },
    quantity: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    expirationDays: { type: Number, default: 30 },
    applicableServiceIds: { type: [String], default: [] },
    archivedAt: { type: String, default: "" },
    archivedBy: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false }
);
rewardSchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: {
      code: { $exists: true, $type: "string", $ne: "" },
    },
  }
);

const customerRewardSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    customerId: { type: String, default: "" },
    customerName: { type: String, default: "" },
    customerEmail: { type: String, default: "" },
    rewardId: { type: String, default: "" },
    rewardName: { type: String, default: "" },
    rewardType: { type: String, default: "" },
    rewardCode: { type: String, default: "" },
    discountType: { type: String, default: "" },
    discountValue: { type: Number, default: 0 },
    rarity: { type: String, default: "" },
    rewardValue: { type: String, default: "" },
    dateEarned: { type: String, default: "" },
    dateGranted: { type: String, default: "" },
    sourceCompletedBookingsCount: { type: Number, default: 0 },
    eligibleBookingCount: { type: Number, default: 0 },
    eligibleBookingIds: { type: [String], default: [] },
    countedBookingIds: { type: [String], default: [] },
    milestoneNumber: { type: Number, default: 0 },
    milestoneKey: { type: String, default: "" },
    status: { type: String, default: "Unused" },
    expirationDate: { type: String, default: "" },
    generatedBy: { type: String, default: "System" },
    claimCode: { type: String, default: "" },
    claimedAt: { type: String, default: "" },
    linkedBookingId: { type: String, default: "" },
    reservedBookingId: { type: String, default: "" },
    reservedAt: { type: String, default: "" },
    linkedPaymentId: { type: String, default: "" },
    discountAmount: { type: Number, default: 0 },
    subtotalAfterDiscount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    finalAmount: { type: Number, default: 0 },
    usedAt: { type: String, default: "" },
    releasedAt: { type: String, default: "" },
    releaseReason: { type: String, default: "" },
    paymentStatusAtUse: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false }
);
customerRewardSchema.index(
  { milestoneKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      milestoneKey: { $exists: true, $type: "string", $ne: "" },
    },
  }
);

module.exports = {
  Booking: mongoose.models.Booking || mongoose.model("Booking", bookingSchema),
  Service: mongoose.models.Service || mongoose.model("Service", serviceSchema),
  StockMonitoringItem:
    mongoose.models.StockMonitoringItem ||
    mongoose.model("StockMonitoringItem", stockMonitoringItemSchema),
  Payment: mongoose.models.Payment || mongoose.model("Payment", paymentSchema),
  User: mongoose.models.User || mongoose.model("User", userSchema),
  AuditLog: mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema),
  Review: mongoose.models.Review || mongoose.model("Review", reviewSchema),
  Promo: mongoose.models.Promo || mongoose.model("Promo", promoSchema),
  Expense: mongoose.models.Expense || mongoose.model("Expense", expenseSchema),
  Commission: mongoose.models.Commission || mongoose.model("Commission", commissionSchema),
  QuoteRequest: mongoose.models.QuoteRequest || mongoose.model("QuoteRequest", quoteRequestSchema),
  SecuritySetting: mongoose.models.SecuritySetting || mongoose.model("SecuritySetting", securitySettingSchema),
  Reward: mongoose.models.Reward || mongoose.model("Reward", rewardSchema),
  CustomerReward: mongoose.models.CustomerReward || mongoose.model("CustomerReward", customerRewardSchema),
};
