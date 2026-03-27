"use client";

import { useEffect, useState } from "react";

const INTERACTIVE_SELECTOR =
  'a, button, input, textarea, select, summary, label, [role="button"], [role="tab"], [data-native-cursor="true"]';

export function CustomCursor() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(pointer: fine)");

    if (!mediaQuery.matches) {
      return;
    }

    const handleMove = (event: MouseEvent) => {
      const interactive = event.target instanceof Element ? event.target.closest(INTERACTIVE_SELECTOR) : null;
      setPosition({ x: event.clientX, y: event.clientY });
      setVisible(!interactive);
    };

    const handleLeave = () => setVisible(false);
    const handleEnter = () => setVisible(true);

    window.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseleave", handleLeave);
    document.addEventListener("mouseenter", handleEnter);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseleave", handleLeave);
      document.removeEventListener("mouseenter", handleEnter);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`custom-cursor ${visible ? "custom-cursor-visible" : ""}`}
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
    >
      <span className="cursor-horizontal" />
      <span className="cursor-vertical" />

      <style jsx>{`
        .custom-cursor {
          position: fixed;
          top: 0;
          left: 0;
          z-index: 140;
          width: 14px;
          height: 14px;
          margin-left: -7px;
          margin-top: -7px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 120ms ease;
          filter: drop-shadow(0 0 3px rgba(34, 211, 238, 0.45));
        }

        .custom-cursor-visible {
          opacity: 1;
        }

        .cursor-horizontal,
        .cursor-vertical {
          position: absolute;
          background: var(--cyan);
        }

        .cursor-horizontal {
          top: 50%;
          left: 0;
          width: 14px;
          height: 1px;
          transform: translateY(-50%);
        }

        .cursor-vertical {
          left: 50%;
          top: 0;
          width: 1px;
          height: 14px;
          transform: translateX(-50%);
        }
      `}</style>
    </div>
  );
}
