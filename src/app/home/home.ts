import { Component, inject } from '@angular/core';
import { AuthStore } from '../auth/auth-store';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  selector: 'app-home',
  styleUrl: './home.scss',
  templateUrl: './home.html',
})
export class Home {
  protected readonly authStore = inject(AuthStore);
}
