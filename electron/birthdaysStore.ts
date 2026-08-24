import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

export interface Birthday {
  id: string;
  name: string;
  // "YYYY-MM-DD" — full date of birth, though "today's birthday" matching
  // only ever looks at the month/day part.
  date: string;
}

let filePathPromise: Promise<string> | null = null;

function getFilePath(): Promise<string> {
  if (!filePathPromise) {
    filePathPromise = (async () => {
      const dir = app.getPath("userData");
      await fs.mkdir(dir, { recursive: true });
      return path.join(dir, "birthdays.json");
    })();
  }
  return filePathPromise;
}

export async function listBirthdays(): Promise<Birthday[]> {
  const filePath = await getFilePath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as Birthday[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    console.error("[birthdaysStore] failed to read birthdays.json:", err);
    return [];
  }
}

async function writeBirthdays(birthdays: Birthday[]): Promise<void> {
  const filePath = await getFilePath();
  const tmpPath = `${filePath}.tmp`;
  // Write-then-rename, same as notesStore.ts: rename is atomic on the same
  // filesystem, so a crash mid-write can't leave a half-written file.
  await fs.writeFile(tmpPath, JSON.stringify(birthdays, null, 2), "utf-8");
  await fs.rename(tmpPath, filePath);
}

export async function saveBirthday(birthday: Birthday): Promise<Birthday[]> {
  const birthdays = await listBirthdays();
  const exists = birthdays.some((b) => b.id === birthday.id);
  const next = exists
    ? birthdays.map((b) => (b.id === birthday.id ? birthday : b))
    : [...birthdays, birthday];
  await writeBirthdays(next);
  return next;
}

export async function deleteBirthday(id: string): Promise<Birthday[]> {
  const birthdays = await listBirthdays();
  const next = birthdays.filter((b) => b.id !== id);
  await writeBirthdays(next);
  return next;
}
