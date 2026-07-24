"use client";

import Link from "next/link";
import { RANGES, type ReportRange } from "@/lib/reports";
import styles from "./RangePicker.module.css";

// Segmented control that changes the reporting window via a ?range= URL param (Next Links, same
// navigation idiom as the budget month chevrons). The server reads the param and recomputes.
export function RangePicker({ active }: { active: ReportRange }) {
  return (
    <div className={styles.picker}>
      {RANGES.map((r) => {
        const on = r.key === active;
        return (
          <Link key={r.key} href={`/reports?range=${r.key}`} className={`${styles.opt} ${on ? styles.on : ""}`}>
            {r.label}
          </Link>
        );
      })}
    </div>
  );
}
