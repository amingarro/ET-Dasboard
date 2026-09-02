import { describe, expect, it } from "vitest";
import {
  isBirthdayToday,
  getTodaysBirthdays,
  daysUntilNextBirthday,
  sortByUpcoming,
} from "./birthdayUtils";
import type { Birthday } from "@/types/electron-api";

function birthday(name: string, date: string): Birthday {
  return { id: name, name, date };
}

describe("isBirthdayToday", () => {
  it("returns true when month/day match today, regardless of year", () => {
    const today = new Date(2026, 8, 2); // 2026-09-02
    expect(isBirthdayToday(birthday("Ana", "1990-09-02"), today)).toBe(true);
  });

  it("returns false when month/day don't match today", () => {
    const today = new Date(2026, 8, 2);
    expect(isBirthdayToday(birthday("Ana", "1990-09-03"), today)).toBe(false);
  });
});

describe("getTodaysBirthdays", () => {
  it("filters the list down to only the birthdays matching today", () => {
    const today = new Date(2026, 8, 2);
    const birthdays = [
      birthday("Ana", "1990-09-02"),
      birthday("Beto", "1990-09-03"),
      birthday("Cami", "2000-09-02"),
    ];

    expect(getTodaysBirthdays(birthdays, today)).toEqual([
      birthday("Ana", "1990-09-02"),
      birthday("Cami", "2000-09-02"),
    ]);
  });

  it("returns an empty array when nobody has a birthday today", () => {
    const today = new Date(2026, 8, 2);
    expect(getTodaysBirthdays([birthday("Beto", "1990-09-03")], today)).toEqual([]);
  });
});

describe("daysUntilNextBirthday", () => {
  it("returns 0 when the birthday is today", () => {
    const today = new Date(2026, 8, 2);
    expect(daysUntilNextBirthday(birthday("Ana", "1990-09-02"), today)).toBe(0);
  });

  it("returns the number of days until a birthday later this year", () => {
    const today = new Date(2026, 8, 2); // Sep 2
    expect(daysUntilNextBirthday(birthday("Ana", "1990-09-12"), today)).toBe(10);
  });

  it("wraps to next year when this year's birthday has already passed", () => {
    const today = new Date(2026, 8, 2); // Sep 2, 2026
    // Birthday was Jan 1 -> already passed this year -> next occurrence Jan 1, 2027.
    const result = daysUntilNextBirthday(birthday("Ana", "1990-01-01"), today);
    const expectedDays = Math.round(
      (new Date(2027, 0, 1).getTime() - new Date(2026, 8, 2).getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(result).toBe(expectedDays);
  });
});

describe("sortByUpcoming", () => {
  it("sorts birthdays soonest-first without mutating the input array", () => {
    const today = new Date(2026, 8, 2); // Sep 2
    const birthdays = [
      birthday("Later", "1990-12-25"),
      birthday("Today", "1990-09-02"),
      birthday("Soon", "1990-09-10"),
    ];
    const original = [...birthdays];

    const sorted = sortByUpcoming(birthdays, today);

    expect(sorted.map((b) => b.name)).toEqual(["Today", "Soon", "Later"]);
    expect(birthdays).toEqual(original);
  });
});
