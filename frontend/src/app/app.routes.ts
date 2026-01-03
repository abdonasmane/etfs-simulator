import { Routes } from '@angular/router';

/**
 * Application routes.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/simulation/pages/simulation-page/simulation-page.component').then(
        m => m.SimulationPageComponent
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
