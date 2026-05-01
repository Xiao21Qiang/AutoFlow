import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "../../styles/css/admin/adminAnalyticsStyle.css";
import { useAdminData } from "../../context/AdminDataContext";
import { exportTabularPdf } from "../../utils/exportTabularPdf";

const PAYMENT_CHART_COLORS = ["#b98a27", "#1d4ed8", "#0f8a3a", "#c2410c"];
const RATING_CHART_COLORS = ["#991b1b", "#c2410c", "#d4a63f", "#65a30d", "#0f766e"];

function normalizePaymentMethod(method) {
  const normalized = String(method || "").trim().toLowerCase();

  if (!normalized) return null;
  if (normalized === "cash") return "Cash";
  if (normalized === "gcash" || normalized === "e-wallet" || normalized === "ewallet") return "E-Wallet";
  if (normalized === "bank transfer") return "Bank Transfer";
  if (normalized === "online transfer") return "Online Transfer";

  return null;
}

export default function AdminAnalytics() {
  const { payments, bookings, reviews, generateAnalyticsInterpretation } = useAdminData();
  const [aiState, setAiState] = useState({
    status: "idle",
    message: "",
    summary: "",
    keyObservations: [],
    possibleCauses: [],
    recommendations: [],
    warnings: [],
    model: "",
  });
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
      .slice(0, 5);
  }, [bookings]);

  const ratingStars = useMemo(
    () => Array.from({ length: 5 }, (_, index) => index < Math.round(avgRating)),
    [avgRating]
  );

  const salesByPaymentMethodChartData = useMemo(
    () =>
      paymentSummaryEntries
        .map(([method, value]) => ({
          method,
          sales: value.amount,
          customers: value.count,
        }))
        .filter((item) => item.sales > 0 || item.customers > 0),
    [paymentSummaryEntries]
  );

  const topServicesChartData = useMemo(
    () =>
      topServices.map((service) => ({
        name: service.name,
        bookings: service.count,
      })),
    [topServices]
  );

  const ratingsSummaryChartData = useMemo(() => {
    const counts = [1, 2, 3, 4, 5].map((rating) => ({
      rating: `${rating} Star${rating > 1 ? "s" : ""}`,
      value: 0,
    }));

    reviews.forEach((review) => {
      const rating = Math.max(1, Math.min(5, Number(review.rating) || 0));
      if (!rating) return;
      counts[rating - 1].value += 1;
    });

    return counts.filter((item) => item.value > 0);
  }, [reviews]);

  const totalRatings = ratingsSummaryChartData.reduce((sum, item) => sum + item.value, 0);

  const analyticsAiPayload = useMemo(
    () => ({
      totals: {
        totalSales,
        totalBookings,
        avgRating,
        paidPayments: paidPayments.length,
        totalReviews: reviews.length,
      },
      topServices: topServices.map((service) => ({
        name: service.name,
        count: service.count,
      })),
      paymentSummary: paymentSummaryEntries.map(([method, value]) => ({
        method,
        count: value.count,
        amount: value.amount,
      })),
      trends: [
        paidPayments.length ? `${paidPayments.length} paid payment record(s) are included in sales totals.` : "",
        topServices[0] ? `${topServices[0].name} is currently the most-booked service.` : "",
        avgRating > 0 ? `Average customer rating is ${avgRating} out of 5.` : "No review ratings are available yet.",
      ].filter(Boolean),
    }),
    [avgRating, paidPayments.length, paymentSummaryEntries, reviews.length, topServices, totalBookings, totalSales]
  );

  const aiInterpretationLines = useMemo(() => {
    const lines = [];
    if (aiState.summary) lines.push(aiState.summary);
    aiState.keyObservations.forEach((item) => lines.push(`Observation: ${item}`));
    aiState.possibleCauses.forEach((item) => lines.push(`Possible cause: ${item}`));
    aiState.recommendations.forEach((item) => lines.push(`Recommendation: ${item}`));
    aiState.warnings.forEach((item) => lines.push(`Warning: ${item}`));
    return lines;
  }, [aiState]);

  const handleGenerateAnalysis = async () => {
    setAiState({
      status: "loading",
      message: "",
      summary: "",
      keyObservations: [],
      possibleCauses: [],
      recommendations: [],
      warnings: [],
      model: "",
    });

    try {
      const response = await generateAnalyticsInterpretation(analyticsAiPayload);
      if (!response?.available) {
        setAiState({
          status: "unavailable",
          message: response?.message || "AI unavailable right now.",
          summary: "",
          keyObservations: [],
          possibleCauses: [],
          recommendations: [],
          warnings: [],
          model: "",
        });
        return;
      }

      setAiState({
        status: "success",
        message: "",
        summary: response.summary || "",
        keyObservations: Array.isArray(response.keyObservations) ? response.keyObservations : [],
        possibleCauses: Array.isArray(response.possibleCauses) ? response.possibleCauses : [],
        recommendations: Array.isArray(response.recommendations) ? response.recommendations : [],
        warnings: Array.isArray(response.warnings) ? response.warnings : [],
        model: response.model || "",
      });
    } catch (error) {
      setAiState({
        status: "error",
        message: error.message || "Unable to generate analysis right now.",
        summary: "",
        keyObservations: [],
        possibleCauses: [],
        recommendations: [],
        warnings: [],
        model: "",
      });
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
          emptyMessage: "No AI analysis generated yet.",
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
                  <button
                    className="anaInterpretationBtn"
                    type="button"
                    onClick={handleGenerateAnalysis}
                    disabled={aiState.status === "loading"}
                  >
                    {aiState.status === "loading" ? "Generating..." : "Generate AI Analysis"}
                  </button>
                </div>
              </div>
              <div className="anaInterpretationStatusRow">
                <div className={`anaInterpretationStatus anaInterpretationStatus-${aiState.status}`}>
                  {aiState.status === "idle" && "Generate a concise AI summary from the current analytics data."}
                  {aiState.status === "loading" && "Analyzing current analytics totals and service trends..."}
                  {aiState.status === "success" && `AI analysis ready${aiState.model ? ` • ${aiState.model}` : ""}`}
                  {aiState.status === "unavailable" && (aiState.message || "AI unavailable right now.")}
                  {aiState.status === "error" && (aiState.message || "Unable to generate analysis right now.")}
                </div>
              </div>
              <div className="anaInterpretationList">
                {aiInterpretationLines.length === 0 ? (
                  <div className="anaInterpretationEmpty">
                    {aiState.status === "loading"
                      ? "Preparing a concise operational summary..."
                      : "No AI analysis generated yet."}
                  </div>
                ) : (
                  aiInterpretationLines.map((line) => (
                    <div key={line} className="anaInterpretationItem">{line}</div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="anaChartsSection">
          <div className="anaChartsHead">
            <div>
              <div className="anaChartsTitle">Visual Analytics</div>
              <div className="anaChartsSub">Live chart views based on current payments, bookings, and review records.</div>
            </div>
          </div>

          <div className="anaChartsGrid">
            <div className="anaChartCard">
              <div className="anaChartCardHead">
                <div className="anaChartTitle">Sales by Payment Method</div>
                <div className="anaChartSub">Paid amounts from approved payment records</div>
              </div>
              {salesByPaymentMethodChartData.length ? (
                <div className="anaChartBox">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={salesByPaymentMethodChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="method" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" tickFormatter={(value) => `₱${Number(value || 0).toLocaleString()}`} />
                      <Tooltip
                        formatter={(value, name) => [
                          name === "sales" ? `Php ${Number(value || 0).toLocaleString()}` : value,
                          name === "sales" ? "Sales" : "Customers",
                        ]}
                        contentStyle={{ borderRadius: 12, border: "1px solid #dbe4ee", boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)" }}
                      />
                      <Legend />
                      <Bar dataKey="sales" name="Sales" radius={[10, 10, 0, 0]}>
                        {salesByPaymentMethodChartData.map((entry, index) => (
                          <Cell key={entry.method} fill={PAYMENT_CHART_COLORS[index % PAYMENT_CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="anaChartEmpty">No paid payment data is available yet.</div>
              )}
            </div>

            <div className="anaChartCard">
              <div className="anaChartCardHead">
                <div className="anaChartTitle">Top Services by Bookings</div>
                <div className="anaChartSub">Most-booked services from current tracking records</div>
              </div>
              {topServicesChartData.length ? (
                <div className="anaChartBox">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={topServicesChartData} layout="vertical" margin={{ top: 10, right: 12, left: 24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={11} stroke="#475569" width={120} />
                      <Tooltip
                        formatter={(value) => [`${value}`, "Bookings"]}
                        contentStyle={{ borderRadius: 12, border: "1px solid #dbe4ee", boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)" }}
                      />
                      <Bar dataKey="bookings" name="Bookings" fill="#b98a27" radius={[0, 10, 10, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="anaChartEmpty">No booking data is available yet.</div>
              )}
            </div>

            <div className="anaChartCard anaChartCardWide">
              <div className="anaChartCardHead">
                <div className="anaChartTitle">Ratings Summary</div>
                <div className="anaChartSub">Distribution of customer review scores</div>
              </div>
              {ratingsSummaryChartData.length ? (
                <div className="anaChartSplit">
                  <div className="anaChartBox anaChartBoxCompact">
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={ratingsSummaryChartData}
                          dataKey="value"
                          nameKey="rating"
                          innerRadius={70}
                          outerRadius={104}
                          paddingAngle={2}
                        >
                          {ratingsSummaryChartData.map((entry, index) => (
                            <Cell key={entry.rating} fill={RATING_CHART_COLORS[index % RATING_CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [`${value}`, "Reviews"]}
                          contentStyle={{ borderRadius: 12, border: "1px solid #dbe4ee", boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)" }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="anaChartCenterTag">
                      <strong>{totalRatings}</strong>
                      <span>Total Reviews</span>
                    </div>
                  </div>

                  <div className="anaRatingsBreakdown">
                    {ratingsSummaryChartData.map((item, index) => (
                      <div key={item.rating} className="anaRatingsRow">
                        <span className="anaRatingsDot" style={{ background: RATING_CHART_COLORS[index % RATING_CHART_COLORS.length] }} />
                        <div className="anaRatingsLabel">{item.rating}</div>
                        <div className="anaRatingsValue">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="anaChartEmpty">No review ratings are available yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
