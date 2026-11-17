"use client";

import { useEffect, useRef } from "react";

/**
 * The core benefit in large type. Words start muted and light up one at a time, in reading
 * order, as the block moves up the screen. Reduced motion shows the finished text at once.
 */
export function TaglineReveal({ text, id }: { text: string; id: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const words = text.split(" ");

  useEffect(() => {
    const block = ref.current;
    if (!block) return;
    const spans = Array.from(block.querySelectorAll<HTMLElement>(".lp-word"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      spans.forEach((span) => span.classList.add("lp-on"));
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = block.getBoundingClientRect();
      const start = window.innerHeight * 0.85;
      const end = window.innerHeight * 0.4;
      // 0 when the first line reaches 85% of the viewport, 1 when the last one passes 40%.
      const progress = Math.min(1, Math.max(0, (start - rect.top) / (start - end + rect.height)));
      const lit = Math.round(progress * spans.length);
      spans.forEach((span, index) => span.classList.toggle("lp-on", index < lit));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // The scroll listener only lives while the block is near the screen.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          window.addEventListener("scroll", schedule, { passive: true });
          schedule();
        } else {
          window.removeEventListener("scroll", schedule);
        }
      },
      { rootMargin: "25% 0px 25% 0px" },
    );
    observer.observe(block);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <h2 ref={ref} id={id} className="lp-tagline t-display">
      {words.map((word, index) => (
        <span key={index} className="lp-word">
          {word}
          {index < words.length - 1 ? " " : ""}
        </span>
      ))}
    </h2>
  );
}
