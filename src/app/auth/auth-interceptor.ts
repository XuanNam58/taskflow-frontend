import { HttpInterceptorFn } from '@angular/common/http';
import { AuthStore } from './auth-store';
import { inject } from '@angular/core';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthStore).accessToken();
  return next(token ? req.clone({ setHeaders: {Authorization: `Bearer ${token}`}}) : req);
};
