import "../../styles/css/shared/filterModal.css";

export default function FilterModal({
  open,
  title,
  fields,
  values,
  onChange,
  onClose,
  onApply,
  onReset,
}) {
  if (!open) return null;

  return (
    <div className="fltModalOverlay" onClick={onClose}>
      <div className="fltModalCard" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="fltModalClose" type="button" onClick={onClose}>
          x
        </button>

        <div className="fltModalTitle">{title}</div>

        <div className="fltModalFields">
          {fields.map((field) => (
            <label className="fltField" key={field.key}>
              <span>{field.label}</span>
              {field.type === "select" ? (
                <select value={values[field.key] || ""} onChange={(e) => onChange(field.key, e.target.value)}>
                  <option value="">All</option>
                  {(field.options || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type || "text"}
                  value={values[field.key] || ""}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  placeholder={field.placeholder || ""}
                />
              )}
            </label>
          ))}
        </div>

        <div className="fltModalActions">
          <button className="fltTextBtn" type="button" onClick={onReset}>
            Reset
          </button>
          <button className="fltTextBtn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="fltPrimaryBtn" type="button" onClick={onApply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
