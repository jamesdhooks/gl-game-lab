import { describe, expect, it } from 'vitest';
import { GALLERY_PAGE_SIZE, paginateGallery } from './galleryPagination.js';

describe('paginateGallery', () => {
  it('keeps at most sixteen experiences on a page', () => {
    const experiences = Array.from({ length: GALLERY_PAGE_SIZE + 1 }, (_, index) => index);

    expect(paginateGallery(experiences, 0)).toEqual({
      items: experiences.slice(0, GALLERY_PAGE_SIZE),
      page: 0,
      pageCount: 2,
    });
    expect(paginateGallery(experiences, 1)).toEqual({ items: [GALLERY_PAGE_SIZE], page: 1, pageCount: 2 });
  });

  it('clamps obsolete page selections after filtering', () => {
    expect(paginateGallery([1, 2], 4)).toEqual({ items: [1, 2], page: 0, pageCount: 1 });
  });
});
