import "../../styles/css/customer/customerTrackingStyle.css";

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import VehicleIssueViewer from "../../components/common/VehicleIssueViewer";
import { apiRequest } from "../../services/api";
import logo from "../../styles/images/aptlogo.png";

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function mapTrackingRecord(booking) {
  if (!booking) return null;

  return {
    id: booking.id,
    customer: booking.customer,
    vehicle: booking.vehicle,
    plate: booking.plate || "",
    service: booking.service,
    assigned: booking.assigned || "",
    date: booking.date,
    time: booking.time || "",
    status: booking.status,
    issueNote: booking.issueNote || "",
    issueTypes: booking.issueTypes || [],
    issueMarkers: booking.issueMarkers || [],
    updatedAt: booking.updatedAt,
  };
}

async function loadTrackingRecord(bookingId) {
  try {
    return await apiRequest(`/api/tracking/${encodeURIComponent(bookingId)}`);
  } catch (_trackingError) {
    const bootstrap = await apiRequest("/api/admin/bootstrap");
    const booking = Array.isArray(bootstrap?.bookings)
      ? bootstrap.bookings.find((item) => String(item?.id || "") === bookingId)
      : null;

    if (!booking) {
      throw new Error("Tracking record not found.");
    }

    return mapTrackingRecord(booking);
  }
}

export default function CustomerTrackingView() {
  const { bookingId } = useParams();
  const normalizedBookingId = String(bookingId || "").trim();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    const loadRecord = async () => {
      setLoading(true);
      try {
        if (!normalizedBookingId) {
          throw new Error("Tracking record not found.");
        }

        const payload = await loadTrackingRecord(normalizedBookingId);
        if (!ignore) {
          setRecord(payload);
          setError("");
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Unable to load tracking details.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadRecord();
    return () => {
      ignore = true;
    };
  }, [normalizedBookingId]);

  const timeline = useMemo(() => {
    const status = String(record?.status || "").toLowerCase();
    return [
      { label: "Booking received", active: Boolean(record?.id) },
      { label: "Schedule confirmed", active: status !== "pending" },
      { label: "Work in progress", active: status === "in progress" || status === "completed" },
      { label: "Ready for release", active: status === "completed" },
    ];
  }, [record]);

  return (
    <div className="clTrackStandalonePage">
      <div className="clTrackStandaloneCard">
        <div className="clTrackStandaloneBrand">
          <img src={logo} alt="ALL PRO-TEC" />
          <div>
            <div className="clTrackStandaloneName">ALL PRO-TEC</div>
            <div className="clTrackStandaloneSub">Service Tracking</div>
          </div>
        </div>

        <div className="clTrackStandaloneHeader">
          <div>
            <h1>Tracking Details</h1>
            <p>Scan-ready public view for vehicle issue mapping and service progress.</p>
          </div>
          <Link className="clTrackStandaloneBack" to="/customer">
            Back to Customer Portal
          </Link>
        </div>

        {loading && <div className="clTrackStandaloneState">Loading tracking details...</div>}
        {!loading && error && <div className="clTrackStandaloneState error">{error}</div>}

        {!loading && !error && record && (
          <>
            <div className="clTrackStandaloneDetails">
              <div><strong>Booking:</strong> {record.id}</div>
              <div><strong>Date:</strong> {formatDate(record.date)}</div>
              <div><strong>Service:</strong> {record.service}</div>
              <div><strong>Vehicle:</strong> {record.vehicle}</div>
              <div><strong>Plate Number:</strong> {record.plate || "-"}</div>
              <div><strong>Status:</strong> {record.status}</div>
              <div><strong>Assigned To:</strong> {record.assigned || "-"}</div>
            </div>

            <div className="clTrackStandaloneTimeline">
              {timeline.map((item) => (
                <div key={item.label} className={item.active ? "active" : ""}>
                  {item.label}
                </div>
              ))}
            </div>

            <VehicleIssueViewer booking={record} className="clTrackIssueView" />
          </>
        )}
      </div>
    </div>
  );
}
