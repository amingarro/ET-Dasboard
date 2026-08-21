"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, List } from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

// contenteditable + document.execCommand, no editor library — per project
// decision. execCommand is deprecated as a general web API but bold/italic/
// insertUnorderedList still work fine in the Chromium build Electron ships.
export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Sync from outside (e.g. switching which note is open) without fighting
  // the user's own typing — only write back when it actually differs from
  // what's already in the DOM.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  function exec(command: string) {
    document.execCommand(command);
    ref.current?.focus();
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function preventBlur(e: React.MouseEvent) {
    // Without this, clicking a toolbar button blurs the contenteditable
    // first, which collapses the text selection execCommand needs.
    e.preventDefault();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="join">
        <button
          type="button"
          title="Negrita"
          className="btn btn-ghost btn-xs join-item"
          onMouseDown={preventBlur}
          onClick={() => exec("bold")}
        >
          <Bold size={14} />
        </button>
        <button
          type="button"
          title="Itálica"
          className="btn btn-ghost btn-xs join-item"
          onMouseDown={preventBlur}
          onClick={() => exec("italic")}
        >
          <Italic size={14} />
        </button>
        <button
          type="button"
          title="Lista"
          className="btn btn-ghost btn-xs join-item"
          onMouseDown={preventBlur}
          onClick={() => exec("insertUnorderedList")}
        >
          <List size={14} />
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className="textarea textarea-bordered h-32 w-full overflow-y-auto empty:before:text-base-content/40 empty:before:content-[attr(data-placeholder)]"
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
      />
    </div>
  );
}
