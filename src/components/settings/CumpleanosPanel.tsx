"use client";

import { useState } from "react";
import { PartyPopper, Trash2 } from "lucide-react";
import { DatePickerPopover } from "@/components/notas/DatePickerPopover";
import { useStore } from "@/lib/store";
import { useBirthdays } from "@/lib/birthdays";
import {
  createBirthday,
  getTodaysBirthdays,
  isBirthdayToday,
  sortByUpcoming,
} from "@/lib/birthdayUtils";

function formatBirthdayDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
  });
}

export function CumpleanosPanel() {
  const { state, update } = useStore();
  const { birthdays, loading: birthdaysLoading, saveBirthday, deleteBirthday } = useBirthdays();
  const [birthdayName, setBirthdayName] = useState("");
  const [birthdayDate, setBirthdayDate] = useState<string | null>(null);

  const todaysBirthdays = getTodaysBirthdays(birthdays);
  const sortedBirthdays = sortByUpcoming(birthdays);

  function addBirthday() {
    const trimmed = birthdayName.trim();
    if (!trimmed || !birthdayDate) return;
    saveBirthday(createBirthday(trimmed, birthdayDate));
    setBirthdayName("");
    setBirthdayDate(null);
  }

  function toggleBirthdayNotifications() {
    update({ birthdayNotificationsEnabled: !state.birthdayNotificationsEnabled });
  }

  return (
    <div className="flex max-w-lg flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-base-content/70">Avisarme el día del cumpleaños</p>
          <p className="text-xs text-base-content/50">
            Muestra una notificación cuando sea el cumpleaños de alguien de la lista.
          </p>
        </div>
        <input
          type="checkbox"
          className="toggle toggle-primary shrink-0"
          checked={state.birthdayNotificationsEnabled}
          onChange={toggleBirthdayNotifications}
        />
      </div>

      {todaysBirthdays.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-primary/30 bg-primary/10 p-4">
          {todaysBirthdays.map((b) => (
            <p key={b.id} className="flex items-center gap-2 font-semibold text-primary">
              <PartyPopper size={18} />
              ¡Hoy {b.name} cumple años!
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-base-300 bg-base-200 p-3">
        <input
          type="text"
          placeholder="Nombre"
          value={birthdayName}
          onChange={(e) => setBirthdayName(e.target.value)}
          className="input input-sm flex-1"
        />
        <DatePickerPopover value={birthdayDate} onChange={setBirthdayDate} />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!birthdayName.trim() || !birthdayDate}
          onClick={addBirthday}
        >
          Agregar
        </button>
      </div>

      {birthdaysLoading ? (
        <p className="text-sm text-base-content/50">Cargando…</p>
      ) : sortedBirthdays.length === 0 ? (
        <p className="text-sm text-base-content/50">No hay cumpleaños cargados todavía.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sortedBirthdays.map((b) => (
            <li
              key={b.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                isBirthdayToday(b) ? "border-primary bg-primary/10" : "border-base-300"
              }`}
            >
              <span className="flex-1 truncate font-medium">{b.name}</span>
              <span className="text-sm text-base-content/60">{formatBirthdayDate(b.date)}</span>
              <button
                type="button"
                title={`Borrar a ${b.name}`}
                className="cursor-pointer rounded-lg p-1.5 text-base-content/40 hover:bg-base-300 hover:text-error"
                onClick={() => deleteBirthday(b.id)}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
