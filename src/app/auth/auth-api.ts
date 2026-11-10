import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AccessTokenResponse {
  accessToken: string;
}

export interface User {
  id: number;
  email: string;
  username: string;
}

@Service()
export class AuthApi {
  private readonly http = inject(HttpClient);

  login(request: LoginRequest): Observable<AccessTokenResponse> {
    return this.http.post<AccessTokenResponse>('/api/auth/login', request);
  }

  refresh(): Observable<AccessTokenResponse> {
    return this.http.post<AccessTokenResponse>('/api/auth/refresh', null);
  }

  me(): Observable<User> {
    return this.http.get<User>('/api/users/me');
  }
}
