# AuthStore and an httpOnly refresh-token cookie

- Date: 2026-10-04
- Status: backend done (XuanNam58/taskflow-backend#9, #10); frontend approved, not started
- Repositories: `taskflow-backend`, `taskflow-frontend`

## Goal

After login, the app knows who the user is, including after a page reload, without exposing the refresh token to JavaScript.

## Before this slice

- `POST /api/auth/login` returned `{ accessToken, refreshToken }` in the JSON body.
- `/refresh` and `/logout` took the refresh token in the request body.
- Access tokens live 15 minutes, refresh tokens 30 days, with rotation. A rotated token is rejected (`401 AUTH_006`), but **there is no reuse detection**: the token that replaced it stays valid. Reuse detection is in the backlog gated before the first public deployment.
- `GET /api/users/me` requires `Authorization: Bearer <access token>`.
- Frontend: `Login` calls `AuthApi.login()` and logs the tokens to the console. Tokens are not stored anywhere.
- The backend disables CSRF (`csrf.disable()`) and is stateless.

## Scope

| In this slice | Later slices |
|---|---|
| Refresh token moves to an `httpOnly` cookie | Automatic refresh on 401, handling of `AUTH_00x` codes |
| `AuthStore`: access token in memory, `currentUser`, `isAuthenticated` | Frontend logout |
| Session restore on app start | `AuthGuard` |
| Minimal interceptor: attach the `Authorization` header | Timeout for the startup requests |
| `Login` stores the session and navigates | Frontend and backend on different domains |
| Minimal `Home` at route `''` | |

## Part 1: Backend

### Principle

Cookies are an HTTP-layer detail, so only `AuthController` knows about them. `AuthService` is unchanged: it still takes `RefreshTokenRequest` and `LogoutRequest` and returns a token pair. The controller reads the cookie to build the service DTO, and splits the refresh token out of the service result to write the cookie.

### Cookie

```
refresh_token=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=<refreshTokenExpiration>
```

| Attribute | Reason |
|---|---|
| `HttpOnly` | JavaScript cannot read it, so XSS cannot steal the token |
| `Secure` | Sent over HTTPS only. Chrome and Firefox treat `http://localhost` as a secure context |
| `SameSite=Strict` | Other sites cannot make the browser send the cookie. This is the CSRF defence, so `csrf.disable()` stays |
| `Path=/api/auth` | The cookie is sent with auth requests only |
| `Max-Age` | Taken from the existing `JwtProperties.refreshTokenExpiration` |

Built with `org.springframework.http.ResponseCookie`; no new dependency.

The clearing cookie must carry the same `Path=/api/auth` as the cookie that was set: browsers identify a cookie by name, domain and path (RFC 6265 §5.3, step 11). Both are built in one place and differ only in `Max-Age`.

### Endpoints

| Endpoint | Request | Response |
|---|---|---|
| `POST /api/auth/login` | unchanged | sets the cookie, body `{ accessToken }` |
| `POST /api/auth/refresh` | no body, reads the `refresh_token` cookie | sets a new cookie (rotation), body `{ accessToken }` |
| `POST /api/auth/logout` | no body, reads the `refresh_token` cookie, still requires an access token | clears the cookie with `Max-Age=0`, `204` |
| `POST /api/auth/logout-all` | unchanged | clears the cookie with `Max-Age=0`, `204` |
| `/register` | unchanged | unchanged |

`/logout` must change in this slice: the frontend can no longer read the refresh token to send it in a body.

When `/logout` or `/refresh` fails, the error response does not clear the cookie. The dead cookie stays until its `Max-Age` runs out; the next startup gets `401` and the app starts unauthenticated. Accepted for this slice.

New DTO: `AccessTokenResponse(String accessToken)`, shared by `/login` and `/refresh`. `RefreshTokenRequest` and `LogoutRequest` stay for the service; the controller builds them from the cookie.

### Errors

`/refresh` or `/logout` without a cookie throws `BusinessException(ErrorCode.INVALID_REFRESH_TOKEN)`, i.e. `401 AUTH_004`. The cookie is read with `@CookieValue(name = "refresh_token", required = false)` so the request does not fall into `MissingRequestCookieException` (400, no `code`).

For `/refresh` this is the normal path on every startup of a user who is not logged in.

### Backend tests

`AuthControllerIntegrationTest`:

1. Login: `Set-Cookie` with every attribute above. The body has no `refreshToken`.
2. Refresh with a cookie: `200`, a new cookie whose value differs from the old one.
3. Refresh without a cookie: `401 AUTH_004`. This test passes even without the check, because `findByTokenForUpdate(null)` produces `where token = NULL`, which matches no row. Write the explicit check anyway; a green test is not proof here.
4. Reusing a rotated cookie: `401 AUTH_006`.
5. Logout: the cookie is cleared with `Max-Age=0` and `Path=/api/auth`.
6. Logout-all: the cookie is cleared the same way.

Update `docs/postman/taskflow-auth.postman_collection.json` and `src/test/http/auth.http`: remove `refreshToken` from the `/refresh` and `/logout` bodies. Change the expected code of the "reuse a rotated refresh token" request from `AUTH_005` to `AUTH_006` (`AUTH_005` means expired).

### Risks

Safari may reject a `Secure` cookie on `http://localhost`. `Secure` stays fixed. The plan includes a step that checks the cookie is stored in the browser in use. Only if that step fails, add configuration to drop `Secure` in development.

The curl and Postman cookie jars may treat a `Secure` cookie over `http` differently from browsers. If the cookie is not sent back, pass it manually with `-H 'Cookie: refresh_token=...'` before concluding the code is wrong.

**Concurrent refresh with the same cookie.** The cookie is shared across tabs. Two tabs starting at once, or two quick reloads, send the same cookie to `/refresh`. The pessimistic lock makes the second request wait; it then sees the token revoked and gets `AUTH_006`, so that tab starts unauthenticated. If the browser cancels the first request before it processes `Set-Cookie`, the remaining cookie holds a dead token and the user is fully logged out. Known limitation, not fixed in this slice. This is the grace-window question in the roadmap, and it must be answered before reuse detection is added; otherwise a double reload would revoke every session.

## Part 2: Frontend

### Units

| File | Responsibility | Depends on |
|---|---|---|
| `AuthApi` (changed) | HTTP only. `login()` returns `{ accessToken }`; adds `refresh()` and `me()` | `HttpClient` |
| `AuthStore` (new) | Holds authentication state; coordinates login and session restore | `AuthApi` |
| `authInterceptor` (new) | Attaches `Authorization: Bearer <token>` when a token exists | `AuthStore` |
| `Login` (changed) | Form and error display. Calls `AuthStore.login()`, then navigates to `/` | `AuthStore`, `Router` |
| `Home` (new) | Route `''`. Shows `username` when logged in, otherwise a link to `/login` | `AuthStore` |

### Types

```ts
interface AccessTokenResponse { accessToken: string }
interface User { id: number; email: string; username: string }
```

`User` declares only the fields the UI uses. The backend also returns `enabled`, `createdAt` and `modifiedAt`; that has no effect.

### AuthStore

```
private, writable
  accessToken : signal<string | null>
  currentUser : signal<User | null>

public, read-only
  accessToken
  currentUser
  isAuthenticated = computed(() => currentUser() !== null)

methods
  login(credentials: LoginRequest): Promise<void>
  restoreSession(): Promise<void>
```

- `@Service()` decorator.
- Callers can only read state. Every state change goes through a store method.
- Methods return `Promise`, because the callers are the form's `async` action and the app initializer. Internally they use `firstValueFrom`.

### Login flow

```
Login.action
  → authStore.login(credentials)
      → AuthApi.login()  → set accessToken
      → AuthApi.me()     → set currentUser      (interceptor attaches the token)
  → router.navigate(['/'])
```

All or nothing: if `me()` fails, the store sets `accessToken` back to `null` and rethrows. There is never a token without a user.

The store does not swallow errors from `login()`. The `HttpErrorResponse` reaches `Login` unchanged, and the existing `AUTH_001` mapping stays.

### Startup flow

```
app.config.ts
  provideAppInitializer(() => inject(AuthStore).restoreSession())

restoreSession
  → AuthApi.refresh() → set accessToken
  → AuthApi.me()      → set currentUser
  any error           → both null, never throws
```

- `provideAppInitializer` blocks rendering until the promise settles, so the first page always sees the correct state.
- `restoreSession` never throws. Not logged in, expired cookie and backend down are all normal.
- The cookie is sent to `/refresh` automatically because, through the dev proxy, every request has the same origin `localhost:4200`. No `withCredentials` is needed.

### Interceptor

```ts
const token = inject(AuthStore).accessToken();
return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
```

Registered in `app.config.ts`: `provideHttpClient(withInterceptors([authInterceptor]))`.

The dependency cycle `AuthStore → AuthApi → HttpClient → interceptor → AuthStore` does not fail at construction, because a functional interceptor calls `inject()` only when a request is made. The interceptor test must confirm this.

### Error handling

| Case | Result |
|---|---|
| Wrong password | `AUTH_001` reaches `Login`, shown as today |
| `me()` fails after a successful login | The store clears the token; `Login` shows the generic message |
| Startup, no cookie | `401 AUTH_004`; the app starts unauthenticated |
| Startup, backend down | The proxy returns `502`; the app starts unauthenticated |
| Startup, backend hangs | The app stays on a blank screen. Known limitation, see Scope |

### Removed

- The `refreshToken` field of `LoginResponse`. The type is renamed `AccessTokenResponse`.
- `console.log(tokens)` in `Login`.
- `Login` no longer injects `AuthApi`.

### Frontend tests

`AuthStore`, with `AuthApi` mocked:
1. Successful `login()`: `accessToken` and `currentUser` are set; `isAuthenticated` is `true`.
2. `me()` fails inside `login()`: `accessToken` is `null` and the error is rethrown.
3. Successful `restoreSession()`: token and user are set.
4. `restoreSession()` when `refresh()` fails: does not throw; `isAuthenticated` is `false`.

`authInterceptor`, with `HttpTestingController`:
5. With a token: the request has `Authorization: Bearer <token>`.
6. Without a token: the request has no `Authorization` header.

`Login`, mock changed from `AuthApi` to `AuthStore`:
7. The three existing tests keep their meaning.
8. Successful login: `router.navigate` is called with `['/']`.

## Order of work

1. ~~Backend, with backend tests.~~ Done: XuanNam58/taskflow-backend#9.
2. ~~Check with Postman or `curl` that the cookie is set and cleared correctly.~~ Done: XuanNam58/taskflow-backend#10.
3. Frontend, with frontend tests.
4. Browser check: log in, reload and stay logged in, confirm `document.cookie` cannot read the cookie.
