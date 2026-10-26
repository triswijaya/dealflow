import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";

/** Inline style that also accepts CSS custom properties, e.g. `{ "--pos": 50 }`. */
export type CSSVars = CSSProperties & { [key: `--${string}`]: string | number };

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

export function useInView<T extends Element>(ref: RefObject<T | null>, threshold = 0.3) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return inView;
}

/** Rupiah with dot separators, no decimals. Hand-rolled so server and client render the same text. */
export function formatRp(value: number) {
  return "Rp" + Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Eases a number toward `target`; returns `target` right away under reduced motion. */
export function useCountTo(target: number, duration = 700) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced || from.current === target) return;
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const next = start + (target - start) * (1 - Math.pow(1 - k, 3));
      from.current = next;
      setValue(next);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);
  return reduced ? target : value;
}

/** Marks `.lp-reveal` elements with `.lp-in` once they scroll into view. Content stays visible without JS. */
export function useReveal(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.classList.add("lp-js");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("lp-in");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    root.querySelectorAll(".lp-reveal").forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      root.classList.remove("lp-js");
    };
  }, [rootRef]);
}

type ScrollTargets = {
  progress: RefObject<HTMLElement | null>;
  sticky: RefObject<HTMLElement | null>;
  hero: RefObject<HTMLElement | null>;
  end: RefObject<HTMLElement | null>;
  sectionIds: readonly string[];
};

/** Drives the header progress bar, the mobile sticky CTA and the active nav link from one scroll listener. */
export function useScrollEffects({ progress, sticky, hero, end, sectionIds }: ScrollTargets) {
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.current?.style.setProperty("transform", `scaleX(${max > 0 ? window.scrollY / max : 0})`);
      const heroEl = hero.current;
      const endEl = end.current;
      const show =
        !!heroEl && !!endEl && window.scrollY > heroEl.offsetHeight - 100 && endEl.getBoundingClientRect().top > window.innerHeight;
      sticky.current?.classList.toggle("lp-show", show);
      let current: string | null = null;
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.4) current = id;
      }
      setActiveId(current);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, [progress, sticky, hero, end, sectionIds]);
  return activeId;
}
