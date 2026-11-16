"use client";

import Image, { type StaticImageData } from "next/image";
import { useState, useSyncExternalStore } from "react";
import { TOUR, type TourKey } from "./content";
import invoice from "./screens/invoice.webp";
import order from "./screens/order.webp";
import pipeline from "./screens/pipeline.webp";
import quotation from "./screens/quotation.webp";
import reports from "./screens/reports.webp";

const SHOTS: Record<TourKey, StaticImageData> = { pipeline, quotation, order, invoice, reports };
const SIZES = "(max-width: 959px) 100vw, 680px";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function keyOf(hash: string): TourKey | null {
  const key = hash.replace("#fitur-", "");
  return TOUR.some((item) => item.key === key) ? (key as TourKey) : null;
}

/**
 * One screen of the product at a time: the open item's screenshot fills the stage beside the
 * list. Footer links point at #fitur-<key>, and arriving through one opens that item.
 */
export function ProductTour() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const [picked, setPicked] = useState<{ key: TourKey; hash: string } | null>(null);
  // A click wins until the hash changes again; then the hash does.
  const active: TourKey = (picked && picked.hash === hash ? picked.key : keyOf(hash)) ?? picked?.key ?? "pipeline";

  return (
    <div className="lp-tour">
      <ol className="lp-tour-list">
        {TOUR.map((item, index) => {
          const open = item.key === active;
          return (
            <li key={item.key} id={`fitur-${item.key}`} className="lp-tour-item" data-open={open}>
              <h3>
                <button type="button" aria-expanded={open} aria-controls={`fitur-${item.key}-isi`} onClick={() => setPicked({ key: item.key, hash })}>
                  <span className="lp-tour-label caption-4">
                    <span className="lp-mono">0{index + 1}</span>
                    {item.label}
                  </span>
                  <span className="heading-6">{item.title}</span>
                </button>
              </h3>
              <div id={`fitur-${item.key}-isi`} className="lp-tour-body" hidden={!open}>
                <p className="body-3">{item.body}</p>
                <div className="lp-tour-shot-inline">
                  <Image src={SHOTS[item.key]} alt={item.alt} sizes={SIZES} placeholder="blur" />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="lp-tour-stage">
        {TOUR.map((item) => (
          <Image
            key={item.key}
            src={SHOTS[item.key]}
            alt={item.key === active ? item.alt : ""}
            aria-hidden={item.key === active ? undefined : true}
            data-active={item.key === active}
            sizes={SIZES}
            placeholder="blur"
          />
        ))}
      </div>
    </div>
  );
}
