import { ChangeDetectionStrategy, Component, HostListener, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HOME_NAV_ITEMS, HomeSectionId, scrollToHomeSection } from '../../home-navigation';
import { BrandMarkComponent } from '../brand-mark.component';

@Component({
  selector: 'app-home-header',
  templateUrl: 'home-header.component.html',
  styleUrls: ['home-header.component.scss'],
  imports: [RouterLink, BrandMarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeHeaderComponent {
  readonly navItems = HOME_NAV_ITEMS;
  readonly menuOpen = signal(false);

  goTo(id: HomeSectionId, event: Event): void {
    this.menuOpen.set(false);
    scrollToHomeSection(id, event);
  }

  goToTop(event: Event): void {
    event.preventDefault();
    this.menuOpen.set(false);
    document.getElementById('inicio')?.scrollIntoView?.({ block: 'start' });
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  @HostListener('document:keydown.escape')
  closeMenu(): void {
    this.menuOpen.set(false);
  }
}
