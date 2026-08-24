"use client";

import { useState } from "react";
import { Cake, PartyPopper, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { useBirthdays } from "@/lib/birthdays";
import {
  createBirthday,
  getTodaysBirthdays,
  isBirthdayToday,
  sortByUpcoming,
} from "@/lib/birthdayUtils";
import { DatePickerPopover } from "@/components/notas/DatePickerPopover";

interface BirthdaysProps {
  onClose: () => void;
}

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
  });
}

export function Birthdays({ onClose }: BirthdaysProps) {
  const { birthdays, loading, saveBirthday, deleteBirthday } = useBirthdays();
  const [name, setName] = useState("");
  const [date, setDate] = useState<string | null>(null);

  const todays = getTodaysBirthdays(birthdays);
  const sorted = sortByUpcoming(birthdays);

  function addBirthday() {
    const trimmed = name.trim();
    if (!trimmed || !date) return;
    saveBirthday(createBirthday(trimmed, date));
    setName("");
    setDate(null);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="card h-full w-full max-w-2xl bg-base-100 shadow-xl"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-body gap-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cake size={22} />
              <div>
                <h2 className="text-xl leading-tight font-bold">Cumpleaños</h2>
                <p className="text-xs leading-tight text-base-content/55">
                  {birthdays.length} {birthdays.length === 1 ? "persona" : "personas"}
                </p>
              </div>
            </div>
            <button type="button" className="btn btn-soft btn-sm btn-circle" onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          {todays.length > 0 && (
            <div className="flex flex-col gap-2 rounded-2xl border border-primary/30 bg-primary/10 p-4">
              {todays.map((b) => (
                <p key={b.id} className="flex items-center gap-2 font-semibold text-primary">
                  <PartyPopper size={18} />
                  ¡Hoy {b.name} cumple años!
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm">
            <input
              type="text"
              placeholder="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input input-sm flex-1"
            />
            <DatePickerPopover value={date} onChange={setDate} />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!name.trim() || !date}
              onClick={addBirthday}
            >
              Agregar
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-base-content/50">Cargando…</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-base-content/50">No hay cumpleaños cargados todavía.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {sorted.map((b) => (
                <li
                  key={b.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                    isBirthdayToday(b) ? "border-primary bg-primary/10" : "border-base-300"
                  }`}
                >
                  <span className="flex-1 truncate font-medium">{b.name}</span>
                  <span className="text-sm text-base-content/60">{formatDate(b.date)}</span>
                  <button
                    type="button"
                    title={`Borrar a ${b.name}`}
                    className="rounded-lg p-1.5 text-base-content/40 hover:bg-base-300 hover:text-error"
                    onClick={() => deleteBirthday(b.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
