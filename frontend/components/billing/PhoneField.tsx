"use client";

import { useEffect, useState } from "react";
import { composePhone, parseStoredPhone, phoneCountries, phoneCountry } from "@/lib/billing/phone-countries";
import { SearchPicker } from "./SearchPicker";
import styles from "./quotation.module.css";

export function PhoneField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [iso, setIso] = useState(() => parseStoredPhone(value).iso);

  useEffect(() => {
    if (!value.trim()) return;
    setIso((current) => parseStoredPhone(value, current).iso);
  }, [value]);

  const country = phoneCountry(iso);
  const national = value.trim().startsWith("+") ? parseStoredPhone(value, iso).national : value;

  return (
    <div className={styles.field}>
      <span>{label}</span>
      <span className={styles.phoneRow}>
        <SearchPicker
          label={`${label} country`}
          value={country.iso}
          placeholder="Search country"
          options={[...phoneCountries]
            .sort((left, right) => left.name.localeCompare(right.name, "en"))
            .map((entry) => ({
              value: entry.iso,
              label: entry.name,
              hint: `+${entry.dial}`,
            }))}
          onChange={(nextIso) => {
            const next = phoneCountry(nextIso);
            setIso(next.iso);
            onChange("");
          }}
        />
        <input
          value={national}
          inputMode="tel"
          placeholder={country.example}
          aria-label={label}
          onChange={(event) => onChange(composePhone(country, event.target.value))}
        />
      </span>
    </div>
  );
}
