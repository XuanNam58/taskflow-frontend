import { computed, inject, Service, signal } from '@angular/core';
import { AuthApi, LoginRequest, User } from './auth-api';
import { firstValueFrom } from 'rxjs';

@Service()
export class AuthStore {
    private readonly authApi = inject(AuthApi);
    private readonly _accessToken = signal<string | null>(null);
    private readonly _currentUser = signal<User | null>(null);

    readonly accessToken = this._accessToken.asReadonly();
    readonly currentUser = this._currentUser.asReadonly();
    readonly isAuthenticated = computed(() => this._currentUser() !== null);

    async login(credentials: LoginRequest): Promise<void> {
        try {
            const accessTokenResponse = await firstValueFrom(this.authApi.login(credentials));
            this._accessToken.set(accessTokenResponse.accessToken);
            const user = await firstValueFrom(this.authApi.me());
            this._currentUser.set(user);
        } catch (error) {
            this._accessToken.set(null);
            throw error;
        }
    }

    async restoreSession(): Promise<void> {
        try {
            const accessTokenResponse = await firstValueFrom(this.authApi.refresh());
            this._accessToken.set(accessTokenResponse.accessToken);
            const user = await firstValueFrom(this.authApi.me());
            this._currentUser.set(user);
        } catch {
            this._accessToken.set(null);
            this._currentUser.set(null);
        }
    }
}
