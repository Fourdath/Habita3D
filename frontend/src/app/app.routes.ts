import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'landing',
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'viewer-3d',
    loadComponent: () =>
      import('./features/viewer-3d/viewer-3d.page').then((m) => m.Viewer3DPage),
  },
  {
    path: '',
    redirectTo: 'landing',
    pathMatch: 'full',
  },
];