import { Component, signal } from '@angular/core';
import { email, form, required, FormField, submit } from '@angular/forms/signals';
import { LoginRequest } from '../auth-api';

@Component({
  imports: [FormField],
  selector: 'app-login',
  templateUrl: './login.html',
})
export class Login {
  loginModel = signal<LoginRequest>({
    email: '',
    password: '',
  });

  loginForm = form(this.loginModel, (path) => {
    required(path.email, { message: 'Email is required' });
    email(path.email, { message: 'Email is invalid' });
    required(path.password, { message: 'Password is required' });
  });

  onSubmit(event: Event) {
    event.preventDefault();
    submit(this.loginForm, async () => {
      const data = this.loginModel();
      console.log('Logging in with: ', data);
    });
  }
}
