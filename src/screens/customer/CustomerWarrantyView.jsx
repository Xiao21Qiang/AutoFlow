import "../../styles/css/customer/customerTrackingStyle.css";

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiRequest } from "../../services/api";
import { WARRANTY_COVERAGE_NOTES, createWarrantyAcknowledgement, normalizeWarrantyChecklist } from "../../utils/warrantyChecklist";
import logo from "../../styles/images/aptlogo.png";

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function CustomerWarrantyView() {
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
          throw new Error("Warranty record not found.");
        }

        const payload = await apiRequest(`/api/tracking/${encodeURIComponent(normalizedBookingId)}/warranty`);
        if (!ignore) {
          setRecord(payload);
          setError("");
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Unable to load warranty document.");
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

  const acknowledgement = createWarrantyAcknowledgement(record || {});
  const checklistItems = normalizeWarrantyChecklist(record?.warrantyChecklistItems || []);

  return (
    <div className="clTrackStandalonePage">
      <div className="clTrackStandaloneCard warrantyDocCard">
        <div className="clTrackStandaloneBrand">
          <img src={logo} alt="ALL PRO-TEC" />
          <div>
            <div className="clTrackStandaloneName">ALL PRO-TEC</div>
            <div className="clTrackStandaloneSub">Warranty Checklist</div>
          </div>
        </div>

        <div className="clTrackStandaloneHeader">
          <div>
            <h1>Warranty Document</h1>
            <p>Read-only released checklist and customer acknowledgement.</p>
          </div>
          <Link className="clTrackStandaloneBack" to="/customer">
            Back to Customer Portal
          </Link>
        </div>

        {loading && <div className="clTrackStandaloneState">Loading warranty document...</div>}
        {!loading && error && <div className="clTrackStandaloneState error">{error}</div>}

        {!loading && !error && record && !record.warrantyReleased && (
          <div className="clTrackStandaloneState">
            {record.message || "Warranty document will be available once released by staff/admin."}
          </div>
        )}

        {!loading && !error && record?.warrantyReleased && (
          <>
            <div className="clTrackStandaloneDetails warrantyDocDetails">
              <div><strong>Booking ID:</strong> {record.id}</div>
              <div><strong>Customer:</strong> {record.customer || "-"}</div>
              <div><strong>Vehicle:</strong> {record.vehicle || "-"}</div>
              <div><strong>Plate Number:</strong> {record.plate || "-"}</div>
              <div><strong>Service:</strong> {record.service || "-"}</div>
              <div><strong>Booking Date:</strong> {formatDate(record.date)}</div>
              <div><strong>Status:</strong> {record.status || "-"}</div>
              <div><strong>Released:</strong> {record.warrantyReleasedAt ? formatDate(record.warrantyReleasedAt) : "Released"}</div>
            </div>

            <section className="warrantyDocSection">
              <h2>Warranty Checklist</h2>
              <div className="warrantyDocTable">
                <div className="warrantyDocHead">
                  <div>Item</div>
                  <div>Status</div>
                  <div>Done By</div>
                  <div>Notes</div>
                </div>
                {checklistItems.map((item) => (
                  <div className="warrantyDocRow" key={item.id}>
                    <div>{item.label}</div>
                    <div>{item.done ? "Checked" : "Not checked"}</div>
                    <div>{item.doneBy || "-"}</div>
                    <div>{item.notes || "-"}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="warrantyDocSection">
              <h2>Coverage Package</h2>
              <div className="warrantyDocPanel">
                <strong>{record.warrantyCoveragePackage || "Warranty coverage package not specified"}</strong>
                {WARRANTY_COVERAGE_NOTES.map((note) => <p key={note}>{note}</p>)}
              </div>
            </section>

            <section className="warrantyDocSection">
              <h2>Acknowledgement</h2>
              <div className="clTrackStandaloneDetails warrantyDocDetails">
                <div><strong>Date / Location:</strong> {acknowledgement.dateLocation || "-"}</div>
                <div><strong>Car Model / Year / Color:</strong> {acknowledgement.carModelYearColor || "-"}</div>
                <div><strong>Plate / CS Number:</strong> {acknowledgement.plateCsNumber || "-"}</div>
                <div><strong>Service Availed:</strong> {acknowledgement.serviceAvailed || "-"}</div>
                <div><strong>Client Name:</strong> {acknowledgement.clientName || "-"}</div>
                <div><strong>Client Signature:</strong> {acknowledgement.clientSignature || "-"}</div>
              </div>
            </section>

            {record.warrantyChecklist ? (
              <section className="warrantyDocSection">
                <h2>Warranty Notes</h2>
                <div className="warrantyDocPanel">{record.warrantyChecklist}</div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
