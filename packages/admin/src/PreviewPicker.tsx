// The preview's pointer layer. Hovering a brick outlines it with its name;
// clicking it selects it in the editor; the selected brick keeps an outline
// (and is scrolled into view when the editor selects it). Links don't
// navigate: ⌘/Ctrl-click follows one, which for a same-origin link asks the
// editor to open the document it points to, and opens any other in a new
// tab. Forms don't submit. Entries are found through the marker the preview
// wraps around each one (`display: contents`, so it adds no box of its own).
import { Portal } from '@solidjs/web';
import { createEffect, createMemo, createSignal, onSettled, Show } from 'solid-js';

import styles from './preview.module.css';

/** The attribute on the element around each entry; its value is the entry's id. */
export const ENTRY_ATTR = 'data-mortar-entry';

export interface PreviewPickerProps {
  /** The selected entry's id, or null. */
  selected: string | null;
  /** The name to show for an entry (its brick's label). */
  label: (id: string) => string;
  /** An entry was clicked. */
  onSelect: (id: string) => void;
  /** A same-origin link was ⌘/Ctrl-clicked; `href` is absolute. */
  onLink: (href: string) => void;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function entryOf(node: EventTarget | null): HTMLElement | null {
  return node instanceof Element ? node.closest<HTMLElement>(`[${ENTRY_ATTR}]`) : null;
}

function linkOf(node: EventTarget | null): HTMLAnchorElement | null {
  return node instanceof Element ? node.closest<HTMLAnchorElement>('a[href]') : null;
}

function findEntry(id: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[${ENTRY_ATTR}]`)) if (el.getAttribute(ENTRY_ATTR) === id) return el;
  return null;
}

/** The viewport box around an element's contents (an entry's marker has no box of its own); null if it has none. */
function measure(el: Element | null): Box | null {
  if (!el?.isConnected) return null;
  const range = document.createRange();
  range.selectNodeContents(el);
  // jsdom has no layout.
  if (typeof range.getBoundingClientRect !== 'function') return null;
  const r = range.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

const place = (b: Box) => ({ top: `${b.top}px`, left: `${b.left}px`, width: `${b.width}px`, height: `${b.height}px` });

/** Draws hover and selection outlines over the preview and turns clicks into selection. */
export function PreviewPicker(props: PreviewPickerProps) {
  const [hover, setHover] = createSignal<{ entry: HTMLElement | null; link: HTMLAnchorElement | null } | null>(null);
  // Bumped (once per frame at most) when the layout may have moved: boxes are measured again.
  const [frame, setFrame] = createSignal(0);
  // The overlay is client-only: it measures the page.
  const [mounted, setMounted] = createSignal(false);
  const [modifier, setModifier] = createSignal('Ctrl');
  let layer: HTMLDivElement | undefined;

  onSettled(() => {
    setMounted(true);
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setModifier('⌘');
    let queued = false;
    const remeasure = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        setFrame((n) => n + 1);
      });
    };
    const onOver = (e: MouseEvent) => {
      const entry = entryOf(e.target);
      const link = linkOf(e.target);
      setHover(entry || link ? { entry, link } : null);
    };
    const onOut = (e: MouseEvent) => {
      if (!e.relatedTarget) setHover(null);
    };
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const link = linkOf(e.target);
      if (link) {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          if (new URL(link.href).origin === location.origin) props.onLink(link.href);
          else window.open(link.href, '_blank', 'noopener');
          return;
        }
      }
      const entry = entryOf(e.target);
      if (entry) props.onSelect(entry.getAttribute(ENTRY_ATTR)!);
    };
    const onSubmit = (e: Event) => e.preventDefault();
    // Changes inside the overlay itself (its boxes moving) don't count.
    const observer = new MutationObserver((records) => {
      if (records.some((r) => !layer?.contains(r.target))) remeasure();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    // Capture: the app's router listens for clicks too, and skips prevented ones.
    window.addEventListener('click', onClick, true);
    window.addEventListener('submit', onSubmit, true);
    window.addEventListener('mouseover', onOver);
    window.addEventListener('mouseout', onOut);
    window.addEventListener('scroll', remeasure, true);
    window.addEventListener('resize', remeasure);
    // Images and fonts that finish loading move things.
    window.addEventListener('load', remeasure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('submit', onSubmit, true);
      window.removeEventListener('mouseover', onOver);
      window.removeEventListener('mouseout', onOut);
      window.removeEventListener('scroll', remeasure, true);
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('load', remeasure, true);
    };
  });

  // Found again on every frame: an entry added with its selection renders after the message.
  const selectedBox = createMemo(() => {
    frame();
    return props.selected ? measure(findEntry(props.selected)) : null;
  });
  const hoverBox = createMemo(() => {
    frame();
    const h = hover();
    return measure(h?.entry ?? h?.link ?? null);
  });
  const hoverLabel = () => {
    const h = hover();
    const name = h?.entry ? props.label(h.entry.getAttribute(ENTRY_ATTR)!) : undefined;
    const hint = h?.link ? `${modifier()}-click to follow the link` : undefined;
    return [name, hint].filter(Boolean).join(' · ');
  };

  // Selected from the editor (the layers tree): bring it into view if it's off screen.
  createEffect(
    () => props.selected,
    (id) => {
      const box = id ? measure(findEntry(id)) : null;
      if (box && (box.top + box.height < 0 || box.top > window.innerHeight)) window.scrollBy({ top: box.top - 16, behavior: 'smooth' });
    },
  );

  return (
    <Show when={mounted()}>
      <Portal>
        <div ref={(el) => (layer = el)} class={styles.layer} aria-hidden="true">
          <Show when={selectedBox()}>{(box) => <div class={styles.selected} style={place(box())} />}</Show>
          <Show when={hoverBox()}>
            {(box) => (
              <div class={styles.hover} style={place(box())}>
                <span class={[styles.tag, box().top < 24 && styles.tagInside]}>{hoverLabel()}</span>
              </div>
            )}
          </Show>
        </div>
      </Portal>
    </Show>
  );
}
