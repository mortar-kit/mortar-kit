// The page model: a page is an ordered array of brick instances. Plain JSON,
// so it can be stored by any adapter and sent to the browser as-is.

/** One brick instance on a page. */
export interface PageEntry {
  /** The `name` of the brick that renders this entry. */
  brick: string;
  /** Stable id, created once when the entry is added. Never an array index. */
  id: string;
  /** The brick's data. Rendering normalizes it (`Brick.normalize`); saving should validate it. */
  data: Record<string, unknown>;
}

/** A page: brick instances in render order. */
export type Page = PageEntry[];
