"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand";
import { NAV, type NavId } from "./content";

/**
 * A floating pill that takes its look from what is under it: clear over the top of the hero,
 * frosted dark over a dark panel once the page has scrolled, frosted light over the canvas.
 * The link of the section under the reading line is marked current; on phones the links move
 * into a full sheet.
 */
export function LandingNav() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<NavId | null>(null);
  const [tone, setTone] = useState<"dark" | "light">("dark");
  const [stuck, setStuck] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const ids: string[] = ["beranda", ...NAV.map((item) => item.id)];
    const sections = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    // A thin band 40% down the viewport: the section crossing it is the one being read.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id === "beranda" ? null : (entry.target.id as NavId));
        }
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-lp-dark]"));
    let frame = 0;
    const update = () => {
      frame = 0;
      const bar = nav.getBoundingClientRect();
      const middle = bar.top + bar.height / 2;
      const overDark = panels.some((panel) => {
        const rect = panel.getBoundingClientRect();
        return rect.top <= middle && rect.bottom >= middle;
      });
      setTone(overDark ? "dark" : "light");
      setStuck(window.scrollY > 24);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      root.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="lp-nav-wrap">
      {/* The open sheet is canvas, so the bar over it reads as light. */}
      <nav ref={navRef} className="lp-nav" aria-label="Navigasi utama" data-tone={open ? "light" : tone} data-stuck={stuck}>
        <a className="lp-brand" href="#beranda" aria-label="DealFlow, kembali ke atas" onClick={close}>
          <BrandMark />
          <span>dealflow</span>
        </a>
        <ul className="lp-nav-links">
          {NAV.map((item) => (
            <li key={item.id}>
              <a className="t-label" href={`#${item.id}`} aria-current={active === item.id ? "location" : undefined}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="lp-nav-actions">
          <Link className="lp-nav-login t-label" href="/login">
            Masuk
          </Link>
          <Link className="lp-btn lp-btn-sm lp-nav-cta" href="/register">
            Buat ruang kerja
          </Link>
          <button
            ref={toggleRef}
            type="button"
            className="lp-menu-toggle"
            aria-expanded={open}
            aria-controls="lp-menu"
            aria-label={open ? "Tutup menu" : "Buka menu"}
            onClick={() => setOpen((value) => !value)}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </div>
      </nav>

      <div id="lp-menu" className="lp-menu" data-open={open} inert={!open}>
        <ul>
          {NAV.map((item) => (
            <li key={item.id}>
              <a className="t-title" href={`#${item.id}`} onClick={close}>
                {item.label}
              </a>
            </li>
          ))}
          <li>
            <Link className="t-title" href="/login">
              Masuk
            </Link>
          </li>
          <li>
            <Link className="lp-btn lp-btn-ink" href="/register">
              Buat ruang kerja
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
