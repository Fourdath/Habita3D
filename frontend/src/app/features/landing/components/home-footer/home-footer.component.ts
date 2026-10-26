import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HOME_NAV_ITEMS, HomeSectionId, scrollToHomeSection } from '../../home-navigation';
import { BrandMarkComponent } from '../brand-mark.component';

@Component({
  selector: 'app-home-footer',
  templateUrl: 'home-footer.component.html',
  styleUrls: ['home-footer.component.scss'],
  imports: [RouterLink, BrandMarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeFooterComponent {
  readonly navItems = HOME_NAV_ITEMS;
  readonly year = new Date().getFullYear();

  goTo(id: HomeSectionId, event: Event): void {
    scrollToHomeSection(id, event);
  }
}
