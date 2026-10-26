export type HomeSectionId = 'como-funciona' | 'herramientas' | 'comenzar';

export interface HomeNavItem {
  id: HomeSectionId;
  label: string;
}

export const HOME_NAV_ITEMS: readonly HomeNavItem[] = [
  { id: 'como-funciona', label: 'Cómo funciona' },
  { id: 'herramientas', label: 'Herramientas' },
  { id: 'comenzar', label: 'Comenzar' },
];

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Scrolls ion-content to a home section and moves keyboard focus to it.
 * Plain `href="#id"` would resolve against `<base href="/">` and trigger a router
 * navigation, so anchors call this and cancel their default action instead.
 * Sections carry `scroll-margin-top` to clear the sticky header.
 */
export function scrollToHomeSection(id: HomeSectionId, event?: Event): void {
  event?.preventDefault();
  const section = document.getElementById(id);
  if (!section) {
    return;
  }
  section.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  section.focus({ preventScroll: true });
}
