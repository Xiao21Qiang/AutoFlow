import { useMemo, useState } from "react";
import "../../styles/css/admin/adminAnalyticsStyle.css";
import { useAdminData } from "../../context/AdminDataContext";
import { exportTabularPdf } from "../../utils/exportTabularPdf";

function normalizePaymentMethod(method) {
  const normalized = String(method || "").trim().toLowerCase();

  if (!normalized) return null;
  if (normalized === "cash") return "Cash";
  if (normalized === "gcash" || normalized === "e-wallet" || normalized === "ewallet") return "E-Wallet";
  if (normalized === "bank transfer") return "Bank Transfer";
  if (normalized === "online transfer") return "Online Transfer";

  return null;
}

function normalizeInterpretationLines(lines) {
  const directLines = Array.isArray(lines)
    ? lines.map((line) => String(line || "").trim()).filter(Boolean)
    : [];

  if (!directLines.length) return [];

  const expandedLines = directLines.flatMap((line) => {
    const sentenceMatches = line.match(/[^.!?]+[.!?]?/g) || [];
    const normalizedSentences = sentenceMatches
      .map((sentence) => sentence.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    if (normalizedSentences.length >= 2 && line.length > 120) {
      return normalizedSentences;
    }

    return [line];
  });

  return expandedLines
    .filter((line) => {
      const normalized = line.toLowerCase();
      return !normalized.startsWith("here are") && !normalized.startsWith("below are") && !normalized.startsWith("based on the provided");
    })
    .slice(0, 4);
}

export default function AdminAnalytics() {
  const { payments, bookings, reviews, generateAnalyticsInterpretation } = useAdminData();
  const [aiInterpretationLines, setAiInterpretationLines] = useState([]);
  const [interpretationLoading, setInterpretationLoading] = useState(false);
  const [interpretationError, setInterpretationError] = useState("");
  const [interpretationModel, setInterpretationModel] = useState("");
  const paidPayments = useMemo(
    () => payments.filter((payment) => String(payment.status || "").toLowerCase() === "paid"),
    [payments]
  );

  const totalSales = useMemo(
    () => paidPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
    [paidPayments]
  );

  const paymentSummaryByMethod = useMemo(() => {
    const map = {
      Cash: { count: 0, amount: 0 },
      "E-Wallet": { count: 0, amount: 0 },
      "Bank Transfer": { count: 0, amount: 0 },
      "Online Transfer": { count: 0, amount: 0 },
    };

    for (const payment of paidPayments) {
      const key = normalizePaymentMethod(payment.method);
      if (!key || !map[key]) continue;
      map[key].count += 1;
      map[key].amount += Number(payment.amount) || 0;
    }
    return map;
  }, [paidPayments]);

  const paymentSummaryEntries = useMemo(
    () => Object.entries(paymentSummaryByMethod),
    [paymentSummaryByMethod]
  );

  const totalBookings = bookings.length;

  const avgRating = useMemo(() => {
    if (!reviews.length) return 0;
    const clean = reviews
      .map((review) => Number(review.rating))
      .filter((value) => !Number.isNaN(value))
      .map((value) => Math.max(1, Math.min(5, value)));
    if (!clean.length) return 0;
    const sum = clean.reduce((a, b) => a + b, 0);
    return Math.round((sum / clean.length) * 10) / 10;
  }, [reviews]);

  const topServices = useMemo(() => {
    const map = new Map();
    for (const booking of bookings) {
      const key = String(booking.service || "Unknown");
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [bookings]);

  const ratingStars = useMemo(
    () => Array.from({ length: 5 }, (_, index) => index < Math.round(avgRating)),
    [avgRating]
  );

  const interpretationPayload = useMemo(
    () => ({
      totalSales,
      totalBookings,
      avgRating,
      reviewCount: reviews.length,
      topServices,
      paymentSummaryByMethod,
    }),
    [avgRating, paymentSummaryByMethod, reviews.length, topServices, totalBookings, totalSales]
  );

  const handleGenerateInterpretation = async () => {
    setInterpretationLoading(true);
    setInterpretationError("");

    try {
      const response = await generateAnalyticsInterpretation(interpretationPayload);
      setAiInterpretationLines(normalizeInterpretationLines(response?.insights));
      setInterpretationModel(String(response?.model || "").trim());
    } catch (_error) {
      setAiInterpretationLines([]);
      setInterpretationModel("");
      setInterpretationError("Ollama interpretation is unavailable right now.");
    } finally {
      setInterpretationLoading(false);
    }
  };

  const exportPdf = () =>
    exportTabularPdf({
      title: "Admin Analytics Report",
      subtitle: "Tabular export of analytics metrics and paid payment summaries.",
      sections: [
        {
          title: "Overview",
          columns: ["Metric", "Value"],
          rows: [
            ["Total Sales", `Php ${totalSales.toLocaleString()}`],
            ["Total Bookings", totalBookings],
            ["Average Ratings", avgRating],
          ],
        },
        {
          title: "Payment Methods",
          columns: ["Method", "Paid Customers", "Paid Amount"],
          rows: paymentSummaryEntries.map(([method, value]) => [
            method,
            value.count,
            `Php ${value.amount.toLocaleString()}`,
          ]),
        },
        {
          title: "Top Services",
          columns: ["Rank", "Service", "Bookings"],
          rows: topServices.map((service, index) => [index + 1, service.name, service.count]),
        },
        {
          title: "Interpretation",
          columns: ["Insight"],
          rows: aiInterpretationLines.map((line) => [line]),
          emptyMessage: "No Ollama interpretation has been generated yet.",
        },
      ],
    });

  return (
    <div className="anaWrap">
      <div className="anaTopRow">
        <button className="anaExportBtn" type="button" onClick={exportPdf}>
          Export as PDF
        </button>
      </div>

      <div className="anaBoard">
        <div className="anaGrid">
          <div className="anaLeft">
            <div className="anaSalesTop">
              <div className="anaSalesLabel">Total Sales</div>
              <div className="anaSalesValue">Php {totalSales.toLocaleString()}</div>
              <div className="anaSalesHint">Based on approved paid payments only</div>
            </div>

            <div className="anaSectionTitle">Customers' mode of payment summary</div>

            <div className="anaPayGrid">
              {paymentSummaryEntries.map(([key, value]) => (
                <div key={key} className="anaPayItem">
                  <div className="anaPayName">{key}</div>
                  <div className="anaPayNum">{value.count}</div>
                  <div className="anaPaySub">Customers</div>
                  <div className="anaPaySub">Php {value.amount.toLocaleString()}</div>
                </div>
              ))}
            </div>

            <div className="anaTopServices">
              <div className="anaTopTitle">Top Services</div>
              {topServices.map((service, index) => (
                <div key={service.name} className="anaServiceRow">
                  <div className="anaBadge">{index + 1}</div>
                  <div className="anaSvcName">{service.name}</div>
                  <div className="anaSvcNum">{service.count} bookings</div>
                </div>
              ))}
            </div>
          </div>

          <div className="anaRight">
            <div className="anaSmallCard anaBlue">
              <div className="anaSmallTitle">Total Bookings</div>
              <div className="anaSmallValue">{totalBookings}</div>
            </div>

            <div className="anaSmallCard anaYellow">
              <div className="anaSmallTitle">Average Ratings</div>
              <div className="anaRatingStars" aria-label={`Average rating ${avgRating} out of 5`}>
                {ratingStars.map((filled, index) => (
                  <span key={index} className={`anaRatingStar${filled ? " filled" : ""}`}>★</span>
                ))}
              </div>
              <div className="anaSmallMeta">{avgRating > 0 ? `${avgRating} / 5` : "No ratings yet"}</div>
              <div className="anaSmallHint">Based on Reviews</div>
            </div>

            <div className="anaInterpretationCard">
              <div className="anaInterpretationHead">
                <div className="anaInterpretationTitle">Interpretation</div>
                <div className="anaInterpretationMeta">
                  {interpretationModel ? <span className="anaInterpretationStatus">Ollama-generated</span> : null}
                  <button className="anaInterpretationBtn" type="button" onClick={handleGenerateInterpretation} disabled={interpretationLoading}>
                    {interpretationLoading ? "Generating..." : interpretationModel ? "Regenerate with Ollama" : "Generate with Ollama"}
                  </button>
                </div>
              </div>
              {interpretationError ? <div className="anaInterpretationError">{interpretationError}</div> : null}
              <div className="anaInterpretationList">
                {aiInterpretationLines.length === 0 ? (
                  <div className="anaInterpretationEmpty">Generate with Ollama to create analytics insights for this module.</div>
                ) : (
                  aiInterpretationLines.map((line) => (
                    <div key={line} className="anaInterpretationItem">{line}</div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
