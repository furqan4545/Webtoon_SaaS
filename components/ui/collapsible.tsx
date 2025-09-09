"use client";

import React, { createContext, useContext, useId, useMemo, useState } from "react";

type CollapsibleContextValue = {
  open: boolean;
  setOpen: (v: boolean) => void;
  contentId: string;
};

const CollapsibleContext = createContext<CollapsibleContextValue | null>(null);

export function Collapsible({ open: openProp, onOpenChange, className, children }: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState<boolean>(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setUncontrolledOpen(v);
    onOpenChange?.(v);
  };
  const contentId = useId();
  const value = useMemo(() => ({ open, setOpen, contentId }), [open, contentId]);
  return (
    <CollapsibleContext.Provider value={value}>
      <div className={className}>{children}</div>
    </CollapsibleContext.Provider>
  );
}

export function CollapsibleTrigger({ className, children }: { className?: string; children: React.ReactNode; }) {
  const ctx = useContext(CollapsibleContext)!;
  return (
    <button
      className={className}
      aria-expanded={ctx.open}
      aria-controls={ctx.contentId}
      onClick={() => ctx.setOpen(!ctx.open)}
      type="button"
    >
      {children}
    </button>
  );
}

export function CollapsibleContent({ className, children, style, maxHeight = 256 }: { className?: string; children: React.ReactNode; style?: React.CSSProperties; maxHeight?: number; }) {
  const ctx = useContext(CollapsibleContext)!;
  return (
    <div
      id={ctx.contentId}
      className={className}
      style={{
        overflow: "hidden",
        transition: "max-height 200ms ease",
        maxHeight: ctx.open ? maxHeight : 0,
        ...style,
      }}
      aria-hidden={!ctx.open}
    >
      {children}
    </div>
  );
}


