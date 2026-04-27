import "../../styles/css/common/notificationCenter.css";

export default function NotificationCenter({
  open,
  onClose,
  notifications = [],
  unreadCount = 0,
  loading = false,
  permission = "default",
  onRequestPermission,
  onMarkRead,
  anchorClassName = "",
}) {
  if (!open) return null;

  return (
    <div className={`notifPanel ${anchorClassName}`.trim()}>
      <div className="notifPanelHead">
        <div>
          <div className="notifPanelTitle">Notifications</div>
          <div className="notifPanelSub">
            {unreadCount > 0 ? `${unreadCount} unread` : "You are all caught up"}
          </div>
        </div>
        <button
          className="notifPanelAction"
          type="button"
          onClick={() => {
            onMarkRead?.();
          }}
        >
          Mark Read
        </button>
      </div>

      {permission !== "granted" && permission !== "unsupported" && (
        <div className="notifPermissionCard">
          <div className="notifPermissionText">Enable browser notifications to receive system updates.</div>
          <button className="notifPermissionBtn" type="button" onClick={onRequestPermission}>
            Enable
          </button>
        </div>
      )}

      {permission === "unsupported" && (
        <div className="notifPermissionCard muted">
          Browser notifications are not supported in this browser.
        </div>
      )}

      <div className="notifList">
        {loading && notifications.length === 0 ? (
          <div className="notifEmpty">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="notifEmpty">No notifications yet.</div>
        ) : (
          notifications.map((item) => (
            <div key={item.id} className={`notifItem${item.isUnread ? " unread" : ""}`}>
              <div className="notifItemTitleRow">
                <div className="notifItemTitle">{item.title}</div>
                {item.isUnread && <span className="notifUnreadDot" aria-hidden="true" />}
              </div>
              <div className="notifItemBody">{item.message}</div>
              <div className="notifItemMeta">{item.ts || item.createdAt || ""}</div>
            </div>
          ))
        )}
      </div>

      <div className="notifPanelFoot">
        <button className="notifPanelClose" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
