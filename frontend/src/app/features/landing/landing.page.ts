import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';

import { HomeFooterComponent } from './components/home-footer/home-footer.component';
import { HomeHeaderComponent } from './components/home-header/home-header.component';
import { HomeHeroComponent } from './components/home-hero/home-hero.component';
import { HomeProcessComponent } from './components/home-process/home-process.component';
import { HomeToolsComponent } from './components/home-tools/home-tools.component';
import { RevealDirective } from './reveal.directive';

@Component({
  selector: 'app-landing',
  templateUrl: 'landing.page.html',
  styleUrls: ['landing.page.scss'],
  imports: [
    IonContent,
    RouterLink,
    HomeHeaderComponent,
    HomeHeroComponent,
    HomeProcessComponent,
    HomeToolsComponent,
    HomeFooterComponent,
    RevealDirective,
  ],
})
export class LandingPage {}
