"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Props = {
  targetEl: HTMLElement | null;
  open: boolean;
  initialText: string;
  onCommit: (text: string) => void;
  onClose: () => void;
  font?: string;
  color?: string;
  align?: CanvasTextAlign;
};

export default function BubbleTextEditorOverlay({
  targetEl,
  open,
  initialText,
  onCommit,
  onClose,
  font = '700 24px/1.2 "Inter", system-ui, sans-serif',
  color = "#000",
  align = "center",
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [value, setValue] = useState(initialText || "");

  useLayoutEffect(() => {
    if (!open || !targetEl) return;
    const r = targetEl.getBoundingClientRect();
    setRect(r);
    const onScrollOrResize = () => setRect(targetEl.getBoundingClientRect());
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, targetEl]);

  useEffect(() => {
    if (!open) return;
    setValue(initialText || "");
    const el = boxRef.current;
    if (!el) return;
    const t = setTimeout(() => {
      el.focus();
      // place caret at end
      const sel = window.getSelection?.();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }, 0);
    return () => clearTimeout(t);
  }, [open, initialText]);

  if (!open || !rect) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        zIndex: 9999,
        pointerEvents: "auto",
      }}
    >
      <div
        ref={boxRef}
        contentEditable
        suppressContentEditableWarning
        dir="ltr"
        spellCheck={false}
        onInput={(e) => setValue((e.target as HTMLDivElement).innerText)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            onCommit(value.trim());
            onClose();
          } else if (e.key === "Escape") {
            onClose();
          }
        }}
        onBlur={() => {
          onCommit(value.trim());
          onClose();
        }}
        style={{
          width: "100%",
          height: "100%",
          outline: "none",
          border: "1px dashed rgba(255,255,255,.25)",
          background: "transparent",
          padding: "8px 10px",
          direction: "ltr",
          unicodeBidi: "plaintext" as any,
          whiteSpace: "pre-wrap",
          textAlign: align as any,
          caretColor: color,
          color,
          font,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: "none",
          userSelect: "text",
        }}
      />
    </div>
  );
}


