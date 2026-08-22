import { canEditIssueNotes } from "./utils/trackingIssueNotes";
import { canEditWarranty } from "./utils/warrantyWorkflow";

const generalManager = {
  id: "STF-GM",
  name: "General Manager",
  email: "gm@example.com",
  userType: "Staff",
  role: "General Manager",
};

const salesAssociate = {
  id: "STF-SA",
  name: "Sales Associate",
  email: "sales@example.com",
  userType: "Staff",
  role: "Sales Associate",
};

const seniorDetailer = {
  id: "STF-SR",
  name: "Senior Detailer",
  email: "senior@example.com",
  userType: "Staff",
  role: "Senior Detailer",
};

const scheduledBooking = {
  id: "B-1",
  status: "Scheduled",
  assigned: "Detailer One",
};

const inProgressBooking = {
  id: "B-2",
  status: "In Progress",
  service: "Ceramic Coating",
  assigned: "Detailer One",
};

const paidPayment = {
  id: "PAY-1",
  bookingId: "B-2",
  finalPaymentStatus: "Paid",
};

describe("Service Tracking manager permissions", () => {
  test("lets General Manager edit unassigned issue notes through the admin-parity tracking flow", () => {
    expect(canEditIssueNotes({
      booking: scheduledBooking,
      currentUser: generalManager,
      allowAdmin: true,
    })).toBe(true);
  });

  test("does not grant Sales Associate issue note edit access", () => {
    expect(canEditIssueNotes({
      booking: scheduledBooking,
      currentUser: salesAssociate,
      allowAdmin: true,
    })).toBe(false);
  });

  test("keeps non-manager staff assignment-scoped even inside shared helpers", () => {
    expect(canEditIssueNotes({
      booking: scheduledBooking,
      currentUser: seniorDetailer,
      allowAdmin: true,
    })).toBe(false);
  });

  test("lets General Manager edit unassigned warranty details when lifecycle gates pass", () => {
    expect(canEditWarranty(inProgressBooking, paidPayment, generalManager, { allowAdmin: true })).toBe(true);
  });

  test("does not grant Sales Associate warranty edit access", () => {
    expect(canEditWarranty(inProgressBooking, paidPayment, salesAssociate, { allowAdmin: true })).toBe(false);
  });

  test("keeps non-manager staff warranty edits assignment-scoped", () => {
    expect(canEditWarranty(inProgressBooking, paidPayment, seniorDetailer, { allowAdmin: true })).toBe(false);
  });
});
