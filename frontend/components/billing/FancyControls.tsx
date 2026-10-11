"use client";

import { Check, ChevronDown, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import styles from "./quotation.module.css";

type Placement = {
  top: number;
  left: number;
  width: number;
  up: boolean;
};

export function FancySelect<T extends string>({
  value,
  options,
  onChange,
  labelId,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  labelId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      setPlacement({
        top: spaceBelow < 220 ? rect.top - 8 : rect.bottom + 8,
        left: rect.left,
        width: rect.width,
        up: spaceBelow < 220,
      });
    }
    function onPointer(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-fancy-menu]")) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    place();
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const menu = open && placement ? (
    <ul
      id={listId}
      className={`${styles.modeMenu} ${placement.up ? styles.modeMenuUp : ""}`}
      role="listbox"
      data-fancy-menu=""
      aria-labelledby={labelId}
      style={{ top: placement.top, left: placement.left, width: placement.width }}
    >
      {options.map((option) => (
        <li key={option.value}>
          <button
            className={styles.modeOption}
            type="button"
            role="option"
            aria-selected={option.value === value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
          >
            {option.label}
            {option.value === value ? <Check size={16} /> : <span />}
          </button>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div className={styles.modeSelect} ref={rootRef}>
      <button
        ref={triggerRef}
        className={styles.modeTrigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label}</span>
        <ChevronDown size={18} />
      </button>
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}

function shownAmount(value: number | null): string {
  if (value == null || value === 0) return "";
  return String(value);
}

export function AmountInput({
  value,
  onChange,
  integer = false,
  emptyAs = 0,
  ...props
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  integer?: boolean;
  emptyAs?: number | null;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(() => shownAmount(value));
  const focused = useRef(false);
  const pattern = integer ? /^\d*$/ : /^\d*\.?\d*$/;

  useEffect(() => {
    if (focused.current) return;
    setText(shownAmount(value));
  }, [value]);

  function commit(next: string) {
    if (next === "" || next === ".") {
      onChange(emptyAs);
      setText("");
      return;
    }
    const parsed = Number(next);
    if (!Number.isFinite(parsed)) {
      setText(shownAmount(value));
      return;
    }
    const amount = integer ? Math.trunc(parsed) : parsed;
    onChange(amount);
    setText(amount === 0 ? "" : String(amount));
  }

  return (
    <input
      {...props}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      value={text}
      onFocus={(event) => {
        focused.current = true;
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        focused.current = false;
        commit(text);
        props.onBlur?.(event);
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (!pattern.test(next)) return;
        setText(next);
        if (next === "" || next === ".") {
          onChange(emptyAs);
          return;
        }
        const parsed = Number(next);
        if (!Number.isFinite(parsed)) return;
        onChange(integer ? Math.trunc(parsed) : parsed);
      }}
    />
  );
}

export function FilePicker({
  accept,
  fileName,
  onFile,
}: {
  accept: string;
  fileName: string | null;
  onFile: (file: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.filePicker}>
      <button className={styles.fileButton} type="button" onClick={() => inputRef.current?.click()}>
        <Upload size={16} />
        {fileName ? "Change file" : "Choose file"}
      </button>
      <span>{fileName ?? "No file chosen"}</span>
      <input
        ref={inputRef}
        className={styles.fileInput}
        type="file"
        accept={accept}
        onChange={(event) => onFile(event.target.files?.[0])}
      />
    </div>
  );
}
