"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BrandMark } from "@/components/brand";
import { NAV, type NavId } from "./content";

/**
 * A compact bar floating off the top edge. The link of the section under the reading line is
 * marked current; on phones the links move into a full height panel.
 */
export function LandingNav() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<NavId | null>(null);
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
      <nav className="lp-nav" aria-label="Navigasi utama">
        <a className="lp-brand" href="#beranda" aria-label="DealFlow, kembali ke atas" onClick={close}>
          <BrandMark />
          <span>dealflow</span>
        </a>
        <ul className="lp-nav-links">
          {NAV.map((item) => (
            <li key={item.id}>
              <a className="title-4" href={`#${item.id}`} aria-current={active === item.id ? "location" : undefined}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="lp-nav-actions">
          <Link className="lp-nav-login title-4" href="/login">
            Masuk
          </Link>
          <Link className="lp-btn lp-btn-light button-sm" href="/register">
            Buat ruang kerja
          </Link>
        </div>
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
      </nav>

      <div id="lp-menu" className="lp-menu" data-open={open} inert={!open}>
        <ul>
          {NAV.map((item, index) => (
            <li key={item.id} style={{ "--i": index } as CSSProperties}>
              <a className="heading-5" href={`#${item.id}`} onClick={close}>
                {item.label}
              </a>
            </li>
          ))}
          <li style={{ "--i": NAV.length } as CSSProperties}>
            <Link className="heading-5" href="/login">
              Masuk
            </Link>
          </li>
          <li style={{ "--i": NAV.length + 1 } as CSSProperties}>
            <Link className="lp-btn lp-btn-light button-md" href="/register">
              Buat ruang kerja
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
