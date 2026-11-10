import { TestBed } from '@angular/core/testing';
import { AuthStore } from './auth-store';
import { AuthApi, User } from './auth-api';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

describe('AuthStore', () => {
  let store: AuthStore;
  let authApi: {
    login: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    me: ReturnType<typeof vi.fn>;
  };

  const user: User = { id: 1, email: 'a@gmail.com', username: 'alice' };
  const credentials = { email: 'a@gmail.com', password: 'secret' };

  beforeEach(() => {
    authApi = {
      login: vi.fn(),
      refresh: vi.fn(),
      me: vi.fn()
    };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthApi, useValue: authApi }],
    });
    store = TestBed.inject(AuthStore);
  });

  it('should set token and user after a successful login', async () => {
    authApi.login.mockReturnValue(of({ accessToken: 'token' }));
    authApi.me.mockReturnValue(of(user));
    await store.login(credentials);
    expect(store.currentUser()).toEqual(user);
    expect(store.accessToken()).toBe('token');
    expect(store.isAuthenticated()).toBe(true);
  });

  it('should clear the token and rethrow when me() fails', async () => {
    authApi.login.mockReturnValue(of({ accessToken: 'token' }));
    authApi.me.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    await expect(store.login(credentials)).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(store.accessToken()).toBe(null);
    expect(store.isAuthenticated()).toBe(false);

  });

  it('should set token and user after a successful refresh', async () => {
    authApi.refresh.mockReturnValue(of({ accessToken: 'token' }));
    authApi.me.mockReturnValue(of(user));
    await store.restoreSession();
    expect(store.currentUser()).toEqual(user);
    expect(store.accessToken()).toBe('token');
    expect(store.isAuthenticated()).toBe(true);
  });

  it('should not throw and stay logged out when refrsh fails', async () => {
    authApi.refresh.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    await expect(store.restoreSession()).resolves.toBeUndefined();
    expect(store.isAuthenticated()).toBe(false);
    expect(authApi.me).not.toHaveBeenCalled();
  });

  it('should clear the token when me() fails after a successful refresh', async () => {
    authApi.refresh.mockReturnValue(of({ accessToken: 'token' }));
    authApi.me.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    await store.restoreSession();
    expect(store.currentUser()).toBe(null);
    expect(store.accessToken()).toBe(null);
    expect(store.isAuthenticated()).toBe(false);
  });
});