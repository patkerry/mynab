"use client";

import Link from "next/link";
import { RANGES, type ReportRange } from "@/lib/reports";

// Segmented control that changes the reporting window via a ?range= URL param (Next Links, same
// navigation idiom as the budget month chevrons). The server reads the param and recomputes.
export function RangePicker({ active }: { active: ReportRange }) {
  return (
    <div style={{ display: "flex", gap: 2, background: "var(--paper)", padding: 3, borderRadius: 10, border: "1px solid var(--line)", flexWrap: "wrap" }}>
      {RANGES.map((r) => {
        const on = r.key === active;
        return (
          <Link
            key={r.key}
            href={`/reports?range=${r.key}`}
            style={{
              padding: "6px 12px",
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 7,
              background: on ? "var(--accent)" : "transparent",
              color: on ? "#fff" : "var(--ink2)",
            }}
          >
            {r.label}
          </Link>
        );
      })}
    </div>
  );
}
