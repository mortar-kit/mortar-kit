// The drag handle on the inspector's left edge: drag it, or focus it and use
// the arrow keys, to resize the inspector; double-click resets the width.
// The width is remembered in localStorage (per browser) when available.
import { createSignal, onSettled } from 'solid-js';

import styles from './ResizeHandle.module.css';

const KEY = 'mortar-admin:inspector-width';
/** The inspector's default, smallest and largest widths, in pixels. */
export const INSPECTOR_WIDTH = { initial: 320, min: 280, max: 720 };

function clamp(width: number): number {
  const max = typeof window === 'undefined' ? INSPECTOR_WIDTH.max : Math.min(INSPECTOR_WIDTH.max, Math.max(INSPECTOR_WIDTH.min, window.innerWidth * 0.6));
  return Math.round(Math.min(max, Math.max(INSPECTOR_WIDTH.min, width)));
}

/**
 * The inspector's width as a signal, read from and saved to localStorage,
 * plus the handle that changes it. `width()` is undefined until the user
 * (or a remembered value) sets one, so the stylesheet's default applies.
 */
export function createInspectorWidth() {
  const [width, setWidth] = createSignal<number | undefined>(undefined);
  onSettled(() => {
    try {
      const stored = Number(localStorage.getItem(KEY));
      if (stored > 0) setWidth(clamp(stored));
    } catch {
      // Storage blocked: start at the default.
    }
  });
  const save = (next: number | undefined) => {
    setWidth(next);
    try {
      if (next === undefined) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, String(next));
    } catch {
      // Storage blocked: the width lasts until reload.
    }
  };
  return { width, setWidth: save };
}

export interface ResizeHandleProps {
  /** The current width in pixels, undefined for the default. */
  width: number | undefined;
  onResize: (width: number | undefined) => void;
}

/** A vertical separator that resizes the panel on its right. */
export function ResizeHandle(props: ResizeHandleProps) {
  const [dragging, setDragging] = createSignal(false);
  let start = { x: 0, width: 0 };
  // The inspector follows the handle; its laid-out width when none is set yet.
  const current = (el: HTMLElement) => props.width ?? (el.nextElementSibling?.getBoundingClientRect().width || INSPECTOR_WIDTH.initial);
  return (
    <div
      class={styles.handle}
      data-dragging={dragging() ? '' : undefined}
      role="separator"
      aria-orientation="vertical"
      aria-label="Inspector width"
      aria-valuemin={INSPECTOR_WIDTH.min}
      aria-valuemax={INSPECTOR_WIDTH.max}
      aria-valuenow={props.width ?? INSPECTOR_WIDTH.initial}
      tabindex="0"
      title="Drag to resize; double-click to reset"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start = { x: e.clientX, width: current(e.currentTarget) };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!dragging()) return;
        // The inspector is on the right: dragging left widens it.
        props.onResize(clamp(start.width + start.x - e.clientX));
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onDblClick={() => props.onResize(undefined)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        if (e.key === 'ArrowLeft') props.onResize(clamp(current(e.currentTarget) + step));
        else if (e.key === 'ArrowRight') props.onResize(clamp(current(e.currentTarget) - step));
        else if (e.key === 'Home') props.onResize(INSPECTOR_WIDTH.min);
        else if (e.key === 'End') props.onResize(clamp(INSPECTOR_WIDTH.max));
        else return;
        e.preventDefault();
      }}
    />
  );
}
