"use client";

import { useEffect } from "react";

/**
 * Page level motion with no markup of its own: sections rise into place once as they enter
 * the viewport, and on phones a sticky call to action shows between the hero and the closing
 * call to action. Without JavaScript everything stays visible and the sticky bar stays hidden.
 */
export function LandingEffects() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp");
    if (!root) return;
    root.classList.add("lp-js");

    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Sections already scrolled past (a reload mid page, a jump to an anchor) show at once.
          if (!entry.isIntersecting && entry.boundingClientRect.bottom > 0) continue;
          entry.target.classList.add("lp-in");
          reveal.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    root.querySelectorAll(".lp-reveal").forEach((element) => reveal.observe(element));

    const sticky = root.querySelector(".lp-sticky");
    const hero = document.getElementById("beranda");
    const end = document.getElementById("mulai");
    let heroGone = false;
    let endVisible = false;
    const watch = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === hero) heroGone = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        else endVisible = entry.isIntersecting;
      }
      sticky?.classList.toggle("lp-show", heroGone && !endVisible);
    });
    if (hero) watch.observe(hero);
    if (end) watch.observe(end);

    return () => {
      reveal.disconnect();
      watch.disconnect();
      root.classList.remove("lp-js");
    };
  }, []);

  return null;
}
