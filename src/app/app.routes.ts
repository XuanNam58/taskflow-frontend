import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login').then((m) => m.Login),
    title: 'Login',
  },
  {
    path: '',
    loadComponent: () => import('./home/home').then((m) => m.Home),
    title: 'Home',
  },
];
