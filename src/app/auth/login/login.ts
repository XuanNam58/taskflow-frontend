import { Component, inject, signal } from '@angular/core';
import { email, form, required, FormField, FormRoot } from '@angular/forms/signals';
import { AuthApi, LoginRequest } from '../auth-api';
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  imports: [FormField, FormRoot],
  selector: 'app-login',
  templateUrl: './login.html',
})
export class Login {
  private readonly authApi = inject(AuthApi);

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
            const tokens = await firstValueFrom(this.authApi.login(field().value()));
            console.log(tokens);
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
