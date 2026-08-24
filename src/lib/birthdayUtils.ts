import type { Birthday } from "@/types/electron-api";

function monthDay(isoDate: string): string {
  return isoDate.slice(5, 10); // "YYYY-MM-DD" -> "MM-DD"
}

export function isBirthdayToday(birthday: Birthday, today: Date = new Date()): boolean {
  const todayMonthDay = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return monthDay(birthday.date) === todayMonthDay;
}

export function getTodaysBirthdays(birthdays: Birthday[], today: Date = new Date()): Birthday[] {
  return birthdays.filter((b) => isBirthdayToday(b, today));
}

export function createBirthday(name: string, date: string): Birthday {
  return { id: crypto.randomUUID(), name, date };
}

// Days from `today` to this person's next birthday (0 = today, wraps to next
// year once this year's date has passed) — used to sort the list soonest-first.
export function daysUntilNextBirthday(birthday: Birthday, today: Date = new Date()): number {
  const [, month, day] = birthday.date.split("-").map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next < start) next = new Date(today.getFullYear() + 1, month - 1, day);
  return Math.round((next.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function sortByUpcoming(birthdays: Birthday[], today: Date = new Date()): Birthday[] {
  return [...birthdays].sort((a, b) => daysUntilNextBirthday(a, today) - daysUntilNextBirthday(b, today));
}
