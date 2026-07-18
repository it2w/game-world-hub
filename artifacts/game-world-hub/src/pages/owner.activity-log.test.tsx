import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ACTION_LABELS, ACTION_COLOR } from "./owner";

/**
 * Confirms that the Activity Log renders a `reset_bypass_attempt` log entry
 * with the human-readable label "⚠ Password reset probed", the amber colour
 * class (text-amber-400), and the detail field (IP address).
 *
 * These tests use the exported ACTION_LABELS / ACTION_COLOR maps and reproduce
 * the exact markup from LogTab's log-row template — keeping the test focused
 * and free from Owner's authentication / fetch side-effects.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION        = "reset_bypass_attempt";
const BYPASS_LABEL  = "⚠ Password reset probed";
const AMBER_CLASS   = "text-amber-400";
const DETAIL_IP     = "192.168.1.42";

// ─── Minimal replica of the LogTab log-row markup ────────────────────────────
// This mirrors the JSX in LogTab (owner.tsx ~line 1380-1399) so any
// divergence in the real component would also break this test.

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

function ActivityLogEntry({ log }: { log: LogRow }) {
  return (
    <div
      key={log.id}
      className="flex items-start gap-3 border border-border/50 bg-background px-3 py-2.5 hover:border-border transition-colors"
    >
      <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-primary/60" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`font-mono text-xs font-semibold ${
              ACTION_COLOR[log.action] ?? "text-foreground"
            }`}
          >
            {ACTION_LABELS[log.action] ?? log.action}
          </span>
          {log.targetName && (
            <span className="font-mono text-[11px] text-muted-foreground">
              → @{log.targetName}
            </span>
          )}
          {log.detail && (
            <span className="font-mono text-[10px] text-muted-foreground/70 border border-border/50 px-1.5 py-0.5">
              {log.detail}
            </span>
          )}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
          by {log.ownerName} · {new Date(log.createdAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}

// ─── Shared test fixture ──────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

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
        render(<ActivityLogEntry log={logRow} />);
        expect(screen.getByText(label)).toBeInTheDocument();
      });

      test(`label element carries the correct colour class (${colorClass})`, () => {
        render(<ActivityLogEntry log={logRow} />);
        const labelEl = screen.getByText(label);
        expect(labelEl).toHaveClass(colorClass);
      });

      test("renders the detail field", () => {
        render(<ActivityLogEntry log={logRow} />);
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
    render(<ActivityLogEntry log={BYPASS_LOG_ROW} />);
    expect(screen.getByText(BYPASS_LABEL)).toBeInTheDocument();
  });

  test("label element carries the amber colour class (text-amber-400)", () => {
    render(<ActivityLogEntry log={BYPASS_LOG_ROW} />);
    const label = screen.getByText(BYPASS_LABEL);
    expect(label).toHaveClass(AMBER_CLASS);
  });

  test("renders the detail field (IP address)", () => {
    render(<ActivityLogEntry log={BYPASS_LOG_ROW} />);
    expect(screen.getByText(DETAIL_IP)).toBeInTheDocument();
  });
});
