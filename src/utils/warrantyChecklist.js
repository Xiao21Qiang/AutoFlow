export const WARRANTY_CHECKLIST_ITEMS = [
  { id: "remove-accessories", label: "Remove detachable accessories / plate number" },
  { id: "initial-wash", label: "Initial car wash" },
  { id: "clay-bar", label: "Clay bar" },
  { id: "vacuum-interior", label: "Car vacuum interior" },
  { id: "tape-trim", label: "Tape matte finish and chrome parts" },
  { id: "acid-rain-removal", label: "Acid rain / water mark removal" },
  { id: "detail-edges", label: "Remove dirt from windows, handles, and lights" },
  { id: "buff-polish", label: "Machine buff / compounding / polishing" },
  { id: "final-wash", label: "Final wash / drying" },
  { id: "precoat", label: "Apply precoat" },
  { id: "coating", label: "Apply Graphene or Kisho coating" },
  { id: "top-coat", label: "Apply detailer / top coat" },
  { id: "tire-vinyl", label: "Tire black / vinyl dressing" },
  { id: "bac-to-zero", label: "Bac to Zero if availed" },
  { id: "infrared-curing", label: "Infrared curing if applicable" },
  { id: "reinstall-accessories", label: "Re-install accessories / plate number" },
  { id: "client-inspection", label: "Final inspection with client" },
];

export const WARRANTY_ISSUE_TYPES = [
  "LS = Light Swirls",
  "LS2 = Large Swirls",
  "DS = Deep Scratches",
  "DSP = Deep Scratches all panels",
  "WS = Water Spot",
  "AR = Acid Rain",
  "OX = Oxidation",
  "CF = Clearcoat Failure",
  "PC = Paint Crack/Chip",
  "RP = Rough Paint",
  "OV = Over Spray",
  "D = Dents/Dings",
  "LM = Loose Moldings",
];

export const WARRANTY_COVERAGE_OPTIONS = [
  "3 Years Marine Ceramic",
  "5 Years APT Graphene",
  "7 Years Multilayer",
];

export const WARRANTY_COVERAGE_NOTES = [
  "Free premium wash every 6 months.",
  "Free recoating on 2 panels yearly depending on package.",
  "Charges may apply for polishing / sealant.",
];

export function normalizeWarrantyChecklist(items = []) {
  const saved = new Map((Array.isArray(items) ? items : []).map((item) => [item.id, item]));
  return WARRANTY_CHECKLIST_ITEMS.map((item) => ({
    ...item,
    done: Boolean(saved.get(item.id)?.done),
    doneBy: saved.get(item.id)?.doneBy || "",
    notes: saved.get(item.id)?.notes || "",
  }));
}

export function createWarrantyAcknowledgement(row = {}) {
  return {
    dateLocation: row.warrantyAcknowledgement?.dateLocation || "",
    carModelYearColor: row.warrantyAcknowledgement?.carModelYearColor || row.vehicle || "",
    plateCsNumber: row.warrantyAcknowledgement?.plateCsNumber || row.plate || "",
    serviceAvailed: row.warrantyAcknowledgement?.serviceAvailed || row.service || "",
    clientName: row.warrantyAcknowledgement?.clientName || row.customer || "",
    clientSignature: row.warrantyAcknowledgement?.clientSignature || "",
  };
}
