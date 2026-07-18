import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ACTION_LABELS, ACTION_COLOR, ActivityLogRow } from "./owner";

/**
 * Confirms that the Activity Log renders log entries correctly using the
 * real production ActivityLogRow component exported from owner.tsx.
 *
 * Covers three cases:
 *   1. A known action (reset_bypass_attempt) — human-readable label + amber colour
 *   2. Bulk security actions — correct labels and colour classes
 *   3. An unknown / future action — raw action string + fallback text-foreground colour
 */

// ─── Shared LogRow type (mirrors owner.tsx interface) ─────────────────────────

interface LogRow {
  id: number;
  action: string;
  targetId: number | null;
  targetName: string | null;
  detail: string | null;
  ownerId: number;
  ownerName: string;
  createdAt: string;
}

// Minimal no-op translation function — the log-row content under test doesn't
// use translated strings (labels come from ACTION_LABELS map, not i18n).
const t = (k: string) => k;

// ─── Known action: reset_bypass_attempt ──────────────────────────────────────

const ACTION        = "reset_bypass_attempt";
const BYPASS_LABEL  = "⚠ Password reset probed";
const AMBER_CLASS   = "text-amber-400";
const DETAIL_IP     = "192.168.1.42";

const BYPASS_LOG_ROW: LogRow = {
  id: 101,
  action: ACTION,
  targetId: null,
  targetName: null,
  detail: DETAIL_IP,
  ownerId: 1,
  ownerName: "owner",
  createdAt: new Date().toISOString(),
};

// ─── Bulk-action parameterised test cases ────────────────────────────────────

const BULK_CASES = [
  {
    action:     "bulk_suspend",
    label:      "Bulk — Suspended",
    colorClass: "text-red-400",
    detail:     "3 users",
  },
  {
    action:     "bulk_force_logout",
    label:      "Bulk — Force Logout",
    colorClass: "text-orange-400",
    detail:     "5 users",
  },
  {
    action:     "bulk_unsuspend",
    label:      "Bulk — Unsuspended",
    colorClass: "text-green-400",
    detail:     "2 users",
  },
] as const;

describe("ActivityLog — bulk security action entries", () => {
  BULK_CASES.forEach(({ action, label, colorClass, detail }) => {
    const logRow: LogRow = {
      id: 200,
      action,
      targetId: null,
      targetName: null,
      detail,
      ownerId: 1,
      ownerName: "owner",
      createdAt: new Date().toISOString(),
    };

    describe(`action: ${action}`, () => {
      test("ACTION_LABELS maps to the correct human-readable label", () => {
        expect(ACTION_LABELS[action]).toBe(label);
      });

      test("ACTION_COLOR maps to the correct colour class", () => {
        expect(ACTION_COLOR[action]).toBe(colorClass);
      });

      test("renders the human-readable label text in the log row", () => {
        render(<ActivityLogRow log={logRow} t={t} />);
        expect(screen.getByText(label)).toBeInTheDocument();
      });

      test(`label element carries the correct colour class (${colorClass})`, () => {
        render(<ActivityLogRow log={logRow} t={t} />);
        const labelEl = screen.getByText(label);
        expect(labelEl).toHaveClass(colorClass);
      });

      test("renders the detail field", () => {
        render(<ActivityLogRow log={logRow} t={t} />);
        expect(screen.getByText(detail)).toBeInTheDocument();
      });
    });
  });
});

describe("ActivityLog — reset_bypass_attempt entry", () => {
  test("ACTION_LABELS maps reset_bypass_attempt to the human-readable label", () => {
    expect(ACTION_LABELS[ACTION]).toBe(BYPASS_LABEL);
  });

  test("ACTION_COLOR maps reset_bypass_attempt to the amber colour class", () => {
    expect(ACTION_COLOR[ACTION]).toBe(AMBER_CLASS);
  });

  test("renders the human-readable label text in the log row", () => {
    render(<ActivityLogRow log={BYPASS_LOG_ROW} t={t} />);
    expect(screen.getByText(BYPASS_LABEL)).toBeInTheDocument();
  });

  test("label element carries the amber colour class (text-amber-400)", () => {
    render(<ActivityLogRow log={BYPASS_LOG_ROW} t={t} />);
    const label = screen.getByText(BYPASS_LABEL);
    expect(label).toHaveClass(AMBER_CLASS);
  });

  test("renders the detail field (IP address)", () => {
    render(<ActivityLogRow log={BYPASS_LOG_ROW} t={t} />);
    expect(screen.getByText(DETAIL_IP)).toBeInTheDocument();
  });
});

// ─── Unknown / future action code fallback ────────────────────────────────────

const UNKNOWN_ACTION = "some_future_action";

const UNKNOWN_LOG_ROW: LogRow = {
  id: 202,
  action: UNKNOWN_ACTION,
  targetId: null,
  targetName: null,
  detail: null,
  ownerId: 1,
  ownerName: "owner",
  createdAt: new Date().toISOString(),
};

describe("ActivityLog — unknown / future action code fallback", () => {
  test("ACTION_LABELS has no entry for an unrecognised action", () => {
    expect(ACTION_LABELS[UNKNOWN_ACTION]).toBeUndefined();
  });

  test("ACTION_COLOR has no entry for an unrecognised action", () => {
    expect(ACTION_COLOR[UNKNOWN_ACTION]).toBeUndefined();
  });

  test("real ActivityLogRow renders the raw action string when no label is defined", () => {
    render(<ActivityLogRow log={UNKNOWN_LOG_ROW} t={t} />);
    expect(screen.getByText(UNKNOWN_ACTION)).toBeInTheDocument();
  });

  test("real ActivityLogRow applies the fallback colour class (text-foreground) to the label", () => {
    render(<ActivityLogRow log={UNKNOWN_LOG_ROW} t={t} />);
    const label = screen.getByText(UNKNOWN_ACTION);
    expect(label).toHaveClass("text-foreground");
  });

  test("raw action string displayed is not empty", () => {
    render(<ActivityLogRow log={UNKNOWN_LOG_ROW} t={t} />);
    const label = screen.getByText(UNKNOWN_ACTION);
    expect(label.textContent).not.toBe("");
  });
});
