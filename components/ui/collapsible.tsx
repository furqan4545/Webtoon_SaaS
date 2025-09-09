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

export function CollapsibleTrigger({ className, children, chevron = false }: { className?: string; children: React.ReactNode; chevron?: boolean; }) {
  const ctx = useContext(CollapsibleContext)!;
  return (
    <button
      className={className}
      aria-expanded={ctx.open}
      aria-controls={ctx.contentId}
      onClick={() => ctx.setOpen(!ctx.open)}
      type="button"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div>{children}</div>
        {chevron && (
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            style={{ transform: ctx.open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease', opacity: 0.8 }}
            aria-hidden
          >
            <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
          </svg>
        )}
      </div>
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


