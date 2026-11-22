import { Routes } from '@angular/router';
import { requireSession } from './core/ep2/session.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage),
  },
  {
    path: 'projects',
    canActivate: [requireSession],
    runGuardsAndResolvers: 'paramsOrQueryParamsChange',
    loadComponent: () => import('./features/projects/projects.page').then(m => m.ProjectsPage),
  },
  {
    path: 'landing',
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'viewer-3d',
    canActivate: [requireSession],
    runGuardsAndResolvers: 'paramsOrQueryParamsChange',
    loadComponent: () =>
      import('./features/viewer-3d/viewer-3d.page').then((m) => m.Viewer3DPage),
  },
  {
    path: '',
    redirectTo: 'landing',
    pathMatch: 'full',
  },
];
