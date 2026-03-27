"use client";

import { useEffect, useRef, useState } from "react";

export function useInView<T extends HTMLElement>(
  options?: IntersectionObserverInit & { once?: boolean }
) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    const node = ref.current;

    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) {
          return;
        }

        if (entry.isIntersecting) {
          setInView(true);
          setHasEntered(true);

          if (options?.once) {
            observer.disconnect();
          }

          return;
        }

        if (!options?.once) {
          setInView(false);
        }
      },
      {
        threshold: options?.threshold ?? 0.25,
        root: options?.root,
        rootMargin: options?.rootMargin ?? "0px",
      }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [options?.once, options?.root, options?.rootMargin, options?.threshold]);

  return { ref, inView, hasEntered };
}
