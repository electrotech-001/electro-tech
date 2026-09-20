import { useState, type FormEvent } from "react";

type EquipmentEditorProps = {
  items: string[];
  onChange: (newItems: string[]) => void;
  disabled?: boolean;
};

const MAX_EQUIPMENT_ITEMS = 20;
const MAX_ITEM_LENGTH = 200;

export function EquipmentEditor({
  items,
  onChange,
  disabled = false,
}: EquipmentEditorProps) {
  const [newItemText, setNewItemText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAddItem = (e: FormEvent) => {
    e.preventDefault();
    if (disabled) return;

    setError(null);
    const trimmed = newItemText.trim();

    if (!trimmed) {
      return;
    }

    if (items.length >= MAX_EQUIPMENT_ITEMS) {
      setError(`Maximum of ${MAX_EQUIPMENT_ITEMS} equipment items reached.`);
      return;
    }

    if (trimmed.length > MAX_ITEM_LENGTH) {
      setError(`Item text cannot exceed ${MAX_ITEM_LENGTH} characters.`);
      return;
    }

    onChange([...items, trimmed]);
    setNewItemText("");
  };

  const handleRemoveItem = (index: number) => {
    if (disabled) return;
    const updated = items.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleMoveUp = (index: number) => {
    if (disabled || index === 0) return;
    const updated = [...items];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    onChange(updated);
  };

  const handleMoveDown = (index: number) => {
    if (disabled || index >= items.length - 1) return;
    const updated = [...items];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    onChange(updated);
  };

  return (
    <div className="equipment-editor">
      <div className="equipment-input-row">
        <input
          type="text"
          className="form-input"
          placeholder="e.g. 10kW Huawei On-Grid Inverter"
          value={newItemText}
          onChange={(e) => {
            setNewItemText(e.target.value);
            if (error) setError(null);
          }}
          disabled={disabled || items.length >= MAX_EQUIPMENT_ITEMS}
          maxLength={MAX_ITEM_LENGTH}
          aria-label="New equipment item"
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleAddItem}
          disabled={disabled || !newItemText.trim() || items.length >= MAX_EQUIPMENT_ITEMS}
        >
          Add
        </button>
      </div>

      {error && <p className="form-hint" style={{ color: "var(--color-danger)" }}>{error}</p>}

      <div className="form-hint">
        {items.length} of {MAX_EQUIPMENT_ITEMS} items added.
      </div>

      {items.length > 0 && (
        <ul className="equipment-list" aria-label="Equipment items">
          {items.map((item, index) => (
            <li key={`${index}-${item}`} className="equipment-item">
              <span>{item}</span>
              <div className="equipment-item-controls">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleMoveUp(index)}
                  disabled={disabled || index === 0}
                  aria-label={`Move "${item}" up`}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleMoveDown(index)}
                  disabled={disabled || index === items.length - 1}
                  aria-label={`Move "${item}" down`}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => handleRemoveItem(index)}
                  disabled={disabled}
                  aria-label={`Remove "${item}"`}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
