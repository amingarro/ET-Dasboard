"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { buildLinkifiedFragment, linkifyHtml, splitNoteBody } from "./noteUtils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  // Abre el mismo lightbox que se usa desde la pantalla de notas (ver
  // ImageLightbox.tsx / Notas.tsx) — se le pasan todas las imágenes
  // *actuales* del editor (no las de `value`, que puede estar un paso
  // atrás) y el índice de la que se clickeó.
  onViewImage?: (filenames: string[], startIndex: number) => void;
}

// Métodos que NoteEditorModal.tsx llama desde su propia barra de
// herramientas — el botón vive ahí (comparte fila con la fecha límite), pero
// la lógica de edición se queda acá, junto con el ref al contenteditable.
export interface RichTextEditorHandle {
  exec: (command: string) => void;
  triggerInsertImage: () => void;
}

// contenteditable + document.execCommand, no editor library — per project
// decision. execCommand is deprecated as a general web API but bold/italic/
// insertUnorderedList still work fine in the Chromium build Electron ships.
export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  { value, onChange, placeholder, onViewImage },
  handleRef,
) {
  const ref = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // execCommand pierde la selección de texto apenas el contenteditable
  // pierde el foco (p. ej. mientras está abierto el selector de archivos del
  // sistema) — se guarda acá para que la imagen se inserte donde estaba
  // realmente el cursor, no donde termine quedando el foco después de que
  // se cierra el selector.
  const savedRangeRef = useRef<Range | null>(null);

  // Sync from outside (e.g. switching which note is open) without fighting
  // the user's own typing — only write back when it actually differs from
  // what's already in the DOM.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  // Migración de URLs sueltas a <a> — una sola vez al montar (= al abrir esta
  // nota), no en cada cambio de `value`: si corriera en cada tecla, cualquier
  // nota que ya tenga una URL reescribiría todo el contenteditable (y
  // perdería el cursor) con cada carácter tipeado en cualquier parte de la
  // nota. Cubre notas guardadas antes de que handlePaste linkificara solo.
  useEffect(() => {
    const editor = ref.current;
    if (!editor) return;
    const linked = linkifyHtml(editor.innerHTML);
    if (linked !== editor.innerHTML) {
      editor.innerHTML = linked;
      onChange(linked);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleInsertImageClick() {
    const selection = window.getSelection();
    // Solo pisa la referencia si hay una selección realmente válida ahora —
    // si no, se deja la que ya había (p. ej. "justo después de la última
    // imagen insertada", ver el final de handleFileChange). Sin esto, un
    // segundo insert seguido pierde el punto de anclaje: después de insertar
    // un bloque contenteditable="false", el navegador a veces deja de ver
    // la selección como "dentro" del editor.
    if (selection && selection.rangeCount > 0 && ref.current?.contains(selection.anchorNode)) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
    fileInputRef.current?.click();
  }

  useImperativeHandle(handleRef, () => ({
    exec(command: string) {
      document.execCommand(command);
      ref.current?.focus();
      if (ref.current) onChange(ref.current.innerHTML);
    },
    triggerInsertImage: handleInsertImageClick,
  }));

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite elegir el mismo archivo de nuevo más adelante
    if (!file) return;
    await insertImageFile(file);
  }

  async function insertImageFile(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const { filename } = await window.electronAPI.notes.saveImage(base64, file.name);

    const editor = ref.current;
    if (!editor) return;
    editor.focus();

    // El <span contenteditable="false"> hace que Chromium trate la imagen (y
    // su botón de borrar) como un bloque atómico: un click la selecciona
    // entera y Backspace/Delete la borra de una — sin esto, borrar una
    // imagen suelta dentro de un contenteditable es poco confiable.
    const wrap = document.createElement("span");
    wrap.className = "note-image-wrap";
    wrap.setAttribute("contenteditable", "false");
    wrap.innerHTML = `<img src="note-image://${filename}" alt=""><div class="note-image-actions"><button type="button" class="note-image-view" title="Ver imagen completa" data-role="view-image">🔍</button><button type="button" class="note-image-delete" title="Eliminar imagen" data-role="delete-image">×</button></div>`;

    // Insertado directo vía Range, no document.execCommand("insertHTML",...):
    // ese comando depende de que la Selection API tenga en ese momento un
    // rango realmente activo "dentro" del editor, y eso deja de cumplirse de
    // forma confiable justo después de insertar un bloque no editable —
    // insertar N imágenes seguidas terminaba insertando solo la primera.
    const range =
      savedRangeRef.current && editor.contains(savedRangeRef.current.startContainer) ? savedRangeRef.current : null;
    if (range) {
      range.deleteContents();
      range.insertNode(wrap);
    } else {
      editor.appendChild(wrap);
    }

    // Deja guardada la posición justo después de la imagen recién insertada,
    // tanto en la Selection real como en savedRangeRef — así, si el próximo
    // click en "Insertar imagen" no logra leer una selección válida, igual
    // se sabe dónde insertar la siguiente imagen en vez de fallar en silencio.
    const afterRange = document.createRange();
    afterRange.setStartAfter(wrap);
    afterRange.collapse(true);
    savedRangeRef.current = afterRange.cloneRange();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(afterRange);

    onChange(editor.innerHTML);
  }

  // Sin esto, pegar copia el formato de origen (fuente/color/tamaño del sitio
  // de donde se copió) en vez de texto plano — lo único que se quiere acá.
  // Las imágenes pegadas (p. ej. una captura de pantalla) se guardan a disco
  // igual que "Insertar imagen", en vez de insertarse como <img> con un
  // data: URL inline (que no queda reconocido por splitNoteBody/note-image://).
  async function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();

    const imageFile = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (imageFile) {
      await insertImageFile(imageFile);
      return;
    }

    insertTextWithLinks(e.clipboardData.getData("text/plain"));
  }

  // Reemplaza la selección actual (o inserta al final) con texto plano cuyas
  // URLs sueltas ya vienen envueltas en <a> — vía Range, no
  // document.execCommand("insertHTML", ...), por la misma razón documentada
  // en insertImageFile: insertHTML depende de un rango realmente activo
  // "dentro" del editor y eso no es confiable acá tampoco.
  function insertTextWithLinks(text: string) {
    const editor = ref.current;
    if (!editor) return;
    editor.focus();

    const fragment = buildLinkifiedFragment(text);
    const lastNode = fragment.lastChild; // capturado antes de insertNode: insertNode vacía el fragment

    const selection = window.getSelection();
    const range =
      selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)
        ? selection.getRangeAt(0)
        : null;
    if (range) {
      range.deleteContents();
      range.insertNode(fragment);
    } else {
      editor.appendChild(fragment);
    }

    if (lastNode) {
      const afterRange = document.createRange();
      afterRange.setStartAfter(lastNode);
      afterRange.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(afterRange);
    }

    onChange(editor.innerHTML);
  }

  function handleEditorClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;

    // Un click normal en un link mientras se edita solo debe mover el
    // cursor (comportamiento nativo de contenteditable) — abrirlo requiere
    // Ctrl/Cmd+clic, como en Google Docs/Notion, para no pelear con la
    // edición de texto normal.
    const link = target.closest("a");
    if (link && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      window.electronAPI.openExternal(link.href);
      return;
    }

    const deleteButton = target.closest('[data-role="delete-image"]');
    if (deleteButton) {
      deleteButton.closest(".note-image-wrap")?.remove();
      if (ref.current) onChange(ref.current.innerHTML);
      return;
    }

    const viewButton = target.closest('[data-role="view-image"]');
    if (viewButton && ref.current && onViewImage) {
      const clickedFilename = viewButton
        .closest(".note-image-wrap")
        ?.querySelector("img")
        ?.getAttribute("src")
        ?.replace("note-image://", "");
      // Todas las imágenes actuales del editor, no las de `value` (prop que
      // puede ir un paso atrás de lo que hay en el DOM en este momento).
      const { imageFilenames } = splitNoteBody(ref.current.innerHTML);
      const startIndex = Math.max(imageFilenames.indexOf(clickedFilename ?? ""), 0);
      onViewImage(imageFilenames, startIndex);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className="note-body textarea textarea-bordered h-[28rem] w-full overflow-y-auto p-4 text-[15px] leading-relaxed empty:before:text-base-content/40 empty:before:content-[attr(data-placeholder)]"
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onPaste={handlePaste}
        onClick={handleEditorClick}
      />
    </div>
  );
});
