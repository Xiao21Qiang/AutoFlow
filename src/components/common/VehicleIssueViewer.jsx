import carDiagram from "../../assets/IMAGE/car.jpg";

const ISSUE_TYPES = [
  "Light Swirls",
  "Large Swirls",
  "Deep Scratches",
  "Deep Scratches on All Panels",
  "Water Spot",
  "Acid Rain",
  "Oxidation",
  "Chemical Failure",
  "Paint Crack / Chip",
  "Rough Paint",
  "Over Spray",
  "Dents / Dings",
  "Loose Moldings",
];

function getMarkerTone(index) {
  const tones = [
    { fill: "#2563eb", shadow: "rgba(37, 99, 235, 0.45)" },
    { fill: "#f97316", shadow: "rgba(249, 115, 22, 0.42)" },
    { fill: "#10b981", shadow: "rgba(16, 185, 129, 0.4)" },
    { fill: "#a855f7", shadow: "rgba(168, 85, 247, 0.4)" },
    { fill: "#ef4444", shadow: "rgba(239, 68, 68, 0.4)" },
    { fill: "#14b8a6", shadow: "rgba(20, 184, 166, 0.4)" },
  ];
  return tones[index % tones.length];
}

export default function VehicleIssueViewer({ booking, className = "" }) {
  const markers = Array.isArray(booking?.issueMarkers) && booking.issueMarkers.length > 0
    ? booking.issueMarkers
    : [{ id: 1, x: 50, y: 50, issueType: "" }];
  const selectedTypes = Array.from(
    new Set(
      markers.map((marker, index) => marker.issueType || booking?.issueTypes?.[index] || "").filter(Boolean)
    )
  );
  const notes = booking?.issueNote || "";

  return (
    <div className={`issueViewSection ${className}`.trim()}>
      <div className="issueViewHead">
        <div className="issueViewTitle">Problem Location</div>
        <div className="issueViewSub">View-only issue map and notes recorded for this vehicle.</div>
      </div>

      <div className="issueViewLayout">
        <div className="issueViewMapPanel">
          <div className="issueViewMapShell">
            <div className="issueViewMap issueViewMapImg">
              <img src={carDiagram} alt="Vehicle issue diagram" className="issueViewCarDiagramImg" draggable={false} />
              {markers.map((marker, index) => {
                const tone = getMarkerTone(index);
                return (
                  <div
                    key={marker.id || index + 1}
                    className="issueViewMarker"
                    style={{
                      left: `${marker.x}%`,
                      top: `${marker.y}%`,
                      background: tone.fill,
                      boxShadow: `0 4px 12px ${tone.shadow}`,
                    }}
                    title={marker.issueType ? `Marker ${marker.id || index + 1}: ${marker.issueType}` : `Marker ${marker.id || index + 1}`}
                  >
                    {marker.id || index + 1}
                  </div>
                );
              })}
            </div>
            <div className="issueViewMarkerLegend">
              {markers.map((marker, index) => {
                const tone = getMarkerTone(index);
                return (
                  <div key={marker.id || index + 1} className="issueViewMarkerLegendItem">
                    <span className="issueViewMarkerLegendDot" style={{ background: tone.fill }} />
                    <span>{marker.issueType || booking?.issueTypes?.[index] || `Marker ${marker.id || index + 1}`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="issueViewRightPanel">
          <div className="issueViewField">
            <span>Issue Type</span>
            <div className="issueViewCheckGrid">
              {ISSUE_TYPES.map((type) => (
                <label key={type} className="issueViewCheckItem">
                  <input type="checkbox" checked={selectedTypes.includes(type)} readOnly />
                  <span>{type}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="issueViewField">
            <span>Issue Notes</span>
            <textarea rows="4" value={notes} readOnly placeholder="No issue notes were added for this booking." />
          </label>
        </div>
      </div>
    </div>
  );
}
