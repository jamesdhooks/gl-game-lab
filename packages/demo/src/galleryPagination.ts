export const GALLERY_PAGE_SIZE = 16;

export interface GalleryPage<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageCount: number;
}

export function paginateGallery<T>(items: readonly T[], requestedPage: number): GalleryPage<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / GALLERY_PAGE_SIZE));
  const page = Math.min(pageCount - 1, Math.max(0, Math.floor(requestedPage)));
  const start = page * GALLERY_PAGE_SIZE;
  return { items: items.slice(start, start + GALLERY_PAGE_SIZE), page, pageCount };
}
