export function normalizePaymentReference(value) {
  return String(value || "")
    .trim()
    .replace(/[\s-]+/g, "")
    .toLowerCase();
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
  if (reason === "matched") return "Match found";
  if (reason === "not-matched") return "No match found";
  return "Unable to read proof image";
}

async function extractTextWithAvailableOcr(proofImage) {
  const tesseract = typeof window !== "undefined" ? window.Tesseract : null;
  if (!tesseract?.recognize) {
    throw new Error("OCR unavailable");
  }

  const result = await tesseract.recognize(proofImage, "eng");
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
    const detectedText = await extractTextWithAvailableOcr(proofImage);
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
