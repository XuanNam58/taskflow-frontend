import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './auth-interceptor';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthStore } from './auth-store';
import { User } from './auth-api';

describe('authInterceptor', () => {
  let store: AuthStore;
  let httpTesting: HttpTestingController;
  let httpClient: HttpClient;

  const user: User = {id: 1, email: 'a@gmail.com', username: 'alice'};
  const credentials = { email: 'a@gmail.com', password: 'secret' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    store = TestBed.inject(AuthStore);
    httpTesting = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
  });

  it('should add Authorization header when there is a token', async () => {
    const done = store.login(credentials);
    httpTesting.expectOne('/api/auth/login').flush({accessToken: 'token'});
    await new Promise((resolve) => setTimeout(resolve));
    const meReq = httpTesting.expectOne('/api/users/me');
    expect(meReq.request.headers.get('Authorization')).toBe('Bearer token');
    meReq.flush(user);
    await done;
  });

  it('should not add Authorization header when there is no token', () => {
    httpClient.get('/test').subscribe();
    const req = httpTesting.expectOne('/test');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  })

  afterEach(() => {
    httpTesting.verify();
  })
});
