"use client";

import { ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import styles from "./quotation.module.css";

export type SearchOption = {
  value: string;
  label: string;
  hint?: string;
};

export function SearchPicker({
  label,
  value,
  options,
  placeholder = "Search",
  emptyLabel = "Choose",
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  options: SearchOption[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => `${option.label} ${option.hint ?? ""}`.toLowerCase().includes(needle));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.searchPicker} ref={rootRef}>
      <button
        className={styles.searchTrigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
      >
        <span>{selected ? selected.label : emptyLabel}</span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className={styles.searchPanel}>
          <label className={styles.searchBox}>
            <Search size={15} />
            <input
              ref={inputRef}
              value={query}
              placeholder={placeholder}
              aria-label={placeholder}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className={styles.searchList} id={listId} role="listbox" aria-label={label}>
            {filtered.length === 0 ? <p className={styles.searchEmpty}>No matches.</p> : filtered.map((option) => (
              <button
                key={option.value}
                className={styles.searchOption}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {option.hint ? <small>{option.hint}</small> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
