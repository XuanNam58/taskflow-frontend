import { Component, inject, signal } from '@angular/core';
import { email, form, required, FormField, FormRoot } from '@angular/forms/signals';
import { LoginRequest } from '../auth-api';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthStore } from '../auth-store';
import { Router } from '@angular/router';

@Component({
  imports: [FormField, FormRoot],
  selector: 'app-login',
  templateUrl: './login.html',
})
export class Login {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  loginModel = signal<LoginRequest>({
    email: '',
    password: '',
  });

  loginForm = form(
    this.loginModel,
    (path) => {
      required(path.email, { message: 'Email is required' });
      email(path.email, { message: 'Email is invalid' });
      required(path.password, { message: 'Password is required' });
    },
    {
      submission: {
        action: async (field) => {
          try {
            await this.authStore.login(field().value());
            await this.router.navigate(['/']);
            return;
          } catch (err) {
            if (err instanceof HttpErrorResponse && err.error?.code === 'AUTH_001') {
              return {
                kind: 'server',
                message: 'Invalid email or password',
              };
            }
            console.error(err);
            return {
              kind: 'server',
              message: 'Unknown error',
            };
          }
        },
      },
    },
  );
}
