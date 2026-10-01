import "../../styles/css/common/notificationCenter.css";

export default function NotificationTrigger({ className = "", loading = false, unreadCount = 0, onClick }) {
  const count = Math.max(0, Number(unreadCount) || 0);
  const accessibleLabel = loading
    ? "Notifications, syncing"
    : count > 0
      ? `Notifications, ${count} unread`
      : "Notifications";

  return (
    <>
      <button
        className={`${className} notifTriggerButton`.trim()}
        type="button"
        onClick={onClick}
        aria-label={accessibleLabel}
        aria-busy={loading ? "true" : undefined}
      >
        <svg className="notifTriggerIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 ? <span className="notifTriggerCount" aria-hidden="true">({count})</span> : null}
      </button>
      {count > 0 ? <span className="notifTriggerDot" aria-hidden="true" /> : null}
    </>
  );
}
