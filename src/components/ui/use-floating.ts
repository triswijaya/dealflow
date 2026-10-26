"use client";

import { useLayoutEffect, type RefObject } from "react";

export type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

const GAP = 6;
const VIEWPORT_MARGIN = 12;
const MIN_HEIGHT = 120;

/** Positions the overlay against its trigger: preferred side, flip, shift, cap the height. */
function place(element: HTMLElement, trigger: HTMLElement, placement: Placement, matchWidth: boolean) {
  const target = trigger.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  if (matchWidth) element.style.width = `${target.width}px`;
  element.style.maxHeight = "";

  const height = element.offsetHeight;
  const below = viewportHeight - target.bottom - GAP - VIEWPORT_MARGIN;
  const above = target.top - GAP - VIEWPORT_MARGIN;
  const top = placement.startsWith("top") ? height <= above || above > below : height > below && above > below;
  const room = Math.max(top ? above : below, MIN_HEIGHT);
  if (height > room) element.style.maxHeight = `${room}px`;
  const shown = Math.min(height, room);

  const width = element.offsetWidth;
  const preferred = placement.endsWith("end") ? target.right - width : target.left;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(preferred, viewportWidth - VIEWPORT_MARGIN - width));
  element.style.left = `${Math.round(left)}px`;
  element.style.top = `${Math.round(top ? target.top - GAP - shown : target.bottom + GAP)}px`;
  element.dataset.side = top ? "top" : "bottom";
}

/**
 * Pins an open overlay (a menu, a listbox, the search results) to the control
 * that opened it. The overlay is lifted into the browser's top layer, so a
 * scrolling table, the kanban board, the panel or a modal dialog can no longer
 * clip it. It opens on the preferred side, flips when that side has no room,
 * stays 12px inside the viewport, and follows its trigger while anything
 * scrolls or resizes.
 *
 * The overlay element needs `popover="manual"`; opening and closing stay with
 * the component, which keeps handling outside clicks and Escape itself.
 */
export function useFloating(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  floating: RefObject<HTMLElement | null>,
  { placement = "bottom-start", matchWidth = false }: { placement?: Placement; matchWidth?: boolean } = {},
) {
  useLayoutEffect(() => {
    const element = floating.current;
    if (!open || !element) return;
    const supported = typeof element.showPopover === "function";
    if (supported && !element.matches(":popover-open")) element.showPopover();

    const update = () => {
      if (anchor.current) place(element, anchor.current, placement, matchWidth);
    };
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    // Results arriving change the overlay's height, which can change its side.
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      if (supported && element.isConnected && element.matches(":popover-open")) element.hidePopover();
    };
  }, [open, anchor, floating, placement, matchWidth]);
}
