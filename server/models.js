const mongoose = require("mongoose");

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
    assigned: { type: String, default: "" },
    preferredDetailer: { type: String, default: "" },
    preferredDetailerName: { type: String, default: "" },
    preferredDetailerId: { type: String, default: "" },
    date: { type: String, default: "" },
    time: { type: String, default: "" },
    placeSlot: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    originalAmount: { type: Number, default: 0 },
    promoId: { type: String, default: "" },
    promoTitle: { type: String, default: "" },
    promoDiscountPercent: { type: Number, default: 0 },
    promoDiscountAmount: { type: Number, default: 0 },
    rewardId: { type: String, default: "" },
    rewardName: { type: String, default: "" },
    rewardType: { type: String, default: "" },
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
    currentStock: { type: Number, default: 0 },
    maxStock: { type: Number, default: 0 },
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
    amount: { type: Number, default: 0 },
    originalAmount: { type: Number, default: 0 },
    promoId: { type: String, default: "" },
    promoTitle: { type: String, default: "" },
    promoDiscountPercent: { type: Number, default: 0 },
    promoDiscountAmount: { type: Number, default: 0 },
    rewardId: { type: String, default: "" },
    rewardName: { type: String, default: "" },
    rewardType: { type: String, default: "" },
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
    downPaymentVerifiedAt: { type: Date, default: null },
    downPaymentVerifiedBy: { type: String, default: "" },
    downPaymentNotes: { type: String, default: "" },
    totalAmount: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    remainingBalance: { type: Number, default: 0 },
    finalPaymentStatus: { type: String, default: "Pending" },
    finalPaymentMethod: { type: String, default: "" },
    finalPaymentReference: { type: String, default: "" },
    finalPaymentProofUrl: { type: String, default: "" },
    finalPaymentProofName: { type: String, default: "" },
    finalPaymentVerifiedAt: { type: Date, default: null },
    finalPaymentVerifiedBy: { type: String, default: "" },
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
    cars: { type: [customerCarSchema], default: [] },
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
    customer: { type: String, default: "" },
    customerEmail: { type: String, default: "" },
    rating: { type: Number, default: 5 },
    comment: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false }
);

const promoSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, default: "" },
    message: { type: String, default: "" },
    status: { type: String, default: "Draft" },
    scheduledFor: { type: String, default: "" },
    expiryMode: { type: String, default: "none" },
    expiresAt: { type: String, default: "" },
    usageLimit: { type: Number, default: 0 },
    usageCount: { type: Number, default: 0 },
    maxUsagePerUser: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
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
  },
  { timestamps: true, versionKey: false }
);

const commissionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    bookingId: { type: String, default: "" },
    date: { type: String, default: "" },
    worker: { type: String, default: "" },
    role: { type: String, default: "" },
    service: { type: String, default: "" },
    serviceValue: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    earned: { type: Number, default: 0 },
    status: { type: String, default: "Pending" },
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
    type: { type: String, default: "Voucher" },
    description: { type: String, default: "" },
    value: { type: String, default: "" },
    rarity: { type: String, default: "Common" },
    weight: { type: Number, default: 10 },
    active: { type: Boolean, default: true },
    stock: { type: Number, default: 0 },
    expirationDays: { type: Number, default: 30 },
  },
  { timestamps: true, versionKey: false }
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
    rewardValue: { type: String, default: "" },
    dateEarned: { type: String, default: "" },
    sourceCompletedBookingsCount: { type: Number, default: 0 },
    status: { type: String, default: "Unused" },
    expirationDate: { type: String, default: "" },
    generatedBy: { type: String, default: "System" },
    claimCode: { type: String, default: "" },
    linkedBookingId: { type: String, default: "" },
    linkedPaymentId: { type: String, default: "" },
    discountAmount: { type: Number, default: 0 },
    subtotalAfterDiscount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    finalAmount: { type: Number, default: 0 },
    usedAt: { type: String, default: "" },
  },
  { timestamps: true, versionKey: false }
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
