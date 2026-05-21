export function normalizePaymentReference(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function getReferenceCheckUnavailableReason({ method, reference, proofImage }) {
  const normalizedMethod = String(method || "").trim().toLowerCase();
  if (normalizedMethod === "cash") return "cash";
  if (!String(proofImage || "").trim()) return "no-proof";
  if (!String(reference || "").trim()) return "no-reference";
  return "";
}

export function getReferenceCheckMessage(reason) {
  if (reason === "cash") return "Cash payment - reference check not required.";
  if (reason === "no-proof") return "No payment proof available for reference checking.";
  if (reason === "no-reference") return "No reference number provided by customer.";
  if (reason === "checking") return "Checking reference...";
  if (reason === "matched") return "Reference matched";
  if (reason === "not-matched") return "Reference not found";
  return "Unable to read proof image";
}

async function loadTesseract() {
  const tesseractModule = await import("tesseract.js");
  return tesseractModule.default || tesseractModule;
}

async function extractTextWithTesseract(proofImage) {
  const tesseract = await loadTesseract();
  const recognize = tesseract.recognize || tesseract.default?.recognize;

  if (typeof recognize !== "function") {
    throw new Error("Tesseract.js OCR is unavailable.");
  }

  const result = await recognize(proofImage, "eng", { logger: () => {} });
  return String(result?.data?.text || result?.text || "").trim();
}

export async function checkPaymentReference({ method, reference, proofImage }) {
  const unavailableReason = getReferenceCheckUnavailableReason({ method, reference, proofImage });
  if (unavailableReason) {
    return {
      status: unavailableReason,
      message: getReferenceCheckMessage(unavailableReason),
      detectedText: "",
    };
  }

  try {
    const detectedText = await extractTextWithTesseract(proofImage);
    const normalizedReference = normalizePaymentReference(reference);
    const normalizedDetectedText = normalizePaymentReference(detectedText);

    if (!normalizedDetectedText) {
      return {
        status: "unreadable",
        message: getReferenceCheckMessage("unreadable"),
        detectedText,
      };
    }

    const matched = Boolean(normalizedReference && normalizedDetectedText.includes(normalizedReference));
    return {
      status: matched ? "matched" : "not-matched",
      message: getReferenceCheckMessage(matched ? "matched" : "not-matched"),
      detectedText,
    };
  } catch (_error) {
    return {
      status: "unreadable",
      message: getReferenceCheckMessage("unreadable"),
      detectedText: "",
    };
  }
}
