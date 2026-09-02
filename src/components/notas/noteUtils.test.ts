import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNote, getDeadlineStatus, getDeadlineBreakdown } from "./noteUtils";

describe("createNote", () => {
  it("fills in the correct defaults for optional fields", () => {
    const note = createNote({ title: "Comprar leche", type: "normal" });

    expect(note.title).toBe("Comprar leche");
    expect(note.type).toBe("normal");
    expect(note.color).toBe("default");
    expect(note.pinned).toBe(false);
    expect(note.bodyHtml).toBe("");
    expect(note.checklist).toEqual([]);
    expect(note.deadline).toBeNull();
    expect(typeof note.id).toBe("string");
    expect(note.id.length).toBeGreaterThan(0);
    expect(note.createdAt).toBe(note.updatedAt);
  });

  it("uses the provided values instead of defaults when given", () => {
    const checklist = [{ id: "1", text: "Item", done: true }];
    const note = createNote({
      title: "Todo",
      type: "todo",
      color: "blue",
      bodyHtml: "<p>hi</p>",
      checklist,
      deadline: "2026-12-31",
    });

    expect(note.color).toBe("blue");
    expect(note.bodyHtml).toBe("<p>hi</p>");
    expect(note.checklist).toEqual(checklist);
    expect(note.deadline).toBe("2026-12-31");
  });
});

describe("getDeadlineStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 2, 12, 0, 0)); // 2026-09-02 12:00
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'overdue' when the deadline's end-of-day has already passed", () => {
    expect(getDeadlineStatus("2026-09-01")).toBe("overdue");
  });

  it("returns 'upcoming' when the deadline is today (end of day hasn't passed yet)", () => {
    expect(getDeadlineStatus("2026-09-02")).toBe("upcoming");
  });

  it("returns 'upcoming' when the deadline is in the future", () => {
    expect(getDeadlineStatus("2026-09-05")).toBe("upcoming");
  });
});

describe("getDeadlineBreakdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 2, 12, 0, 0)); // 2026-09-02 12:00
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("breaks down the remaining time into days/hours/minutes", () => {
    // Deadline end-of-day 2026-09-03 23:59:59, "now" is 2026-09-02 12:00:00.
    const result = getDeadlineBreakdown("2026-09-03");
    expect(result).toEqual({ days: 1, hours: 11, minutes: 59 });
  });

  it("clamps to zero instead of going negative once the deadline has passed", () => {
    const result = getDeadlineBreakdown("2026-08-01");
    expect(result).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
});
