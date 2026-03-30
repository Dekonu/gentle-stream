"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type Category } from "@/lib/constants";

interface CategoryDrawerProps {
  selected: Category | null;
  onSelect: (cat: Category) => void;
  topOffsetPx?: number;
}

export default function CategoryDrawer({
  selected,
  onSelect,
  topOffsetPx = 0,
}: CategoryDrawerProps) {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function handleSelect(cat: Category) {
    onSelect(cat);
    setOpen(false);
  }

  const topPx = Math.max(8, topOffsetPx + 10);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="category-drawer"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          top: `${topPx}px`,
          right: "0.95rem",
          zIndex: 130,
          border: "1px solid #1a1a1a",
          background: "#1a1a1a",
          color: "#faf8f3",
          padding: "0.48rem 0.82rem",
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "0.72rem",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        }}
      >
        Categories
      </button>

      {open ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 140,
          }}
        >
          <button
            type="button"
            aria-label="Close category drawer"
            onClick={() => setOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              border: "none",
              background: "rgba(0, 0, 0, 0.34)",
              cursor: "pointer",
            }}
          />

          <aside
            id="category-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Choose category"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "100%",
              width: "min(360px, 90vw)",
              background: "#faf8f3",
              borderLeft: "2px solid #1a1a1a",
              boxShadow: "-8px 0 28px rgba(0,0,0,0.24)",
              display: "flex",
              flexDirection: "column",
              transform: "translateX(0)",
              transition: "transform 0.18s ease",
            }}
          >
            <div
              style={{
                padding: "0.95rem 1rem 0.7rem",
                borderBottom: "1px solid #d8d2c7",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "1rem",
                  color: "#0d0d0d",
                }}
              >
                Categories
              </h2>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  border: "1px solid #1a1a1a",
                  background: "#fff",
                  color: "#1a1a1a",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.72rem",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  padding: "0.35rem 0.62rem",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                overflowY: "auto",
                padding: "0.55rem",
                display: "grid",
                gap: "0.3rem",
              }}
            >
              {CATEGORIES.map((cat) => {
                const isActive = selected === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleSelect(cat)}
                    style={{
                      textAlign: "left",
                      width: "100%",
                      border: isActive ? "2px solid #1a1a1a" : "1px solid #d8d2c7",
                      background: isActive ? "#c8a84b" : "#fff",
                      color: "#1a1a1a",
                      padding: "0.6rem 0.65rem",
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontSize: "0.76rem",
                      letterSpacing: "0.03em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

