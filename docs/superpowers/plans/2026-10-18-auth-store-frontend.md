# AuthStore Frontend Implementation Plan

> **For agentic workers:** this plan follows the project's teaching protocol (`CLAUDE.md`). The user writes the code and the tests; the assistant reviews each task. Do not fill in implementation bodies unless the user asks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After login the app knows who the user is, including after a page reload, using the access token in memory and the httpOnly refresh cookie set by the backend.

**Architecture:** `AuthApi` stays HTTP-only. A new `AuthStore` holds the access token and current user in private signals and exposes read-only views. A functional interceptor reads the token from the store. An app initializer calls `restoreSession()` before the first render. `Login` delegates to the store and navigates; `Home` reads the store.

**Tech Stack:** Angular 22.1 (standalone, `@Service()`, signals, Signal Forms, functional interceptors), Vitest via `ng test`, `HttpTestingController`.

**Spec:** `docs/superpowers/specs/2026-10-04-auth-store-design.md`, Part 2.

## Global Constraints

- Backend contract: `/login` and `/refresh` return `{ accessToken }`; `/refresh` takes no body and reads the `refresh_token` cookie; `GET /api/users/me` needs `Authorization: Bearer <token>`.
- Relative URLs (`/api/...`) through the dev proxy. No `withCredentials`, no base URL.
- Singletons use `@Service()` and `inject()`. No `standalone: true`, no explicit `OnPush`.
- Callers only read store state. Every state change goes through a store method.
- No `any`. Native control flow in templates. Must pass AXE / WCAG AA.
- Test command: `npx ng test --watch=false --include <file> --reporters=verbose`. Full suite: `npx ng test --watch=false`.
- A new test is only trusted after it has been seen red for the right reason.
- Commits: `type(scope): message`, stage files by name (never `git add .`, `.claude/` is untracked). Branch `feat/auth-store`.

## File map

| File | Change |
|---|---|
| `src/app/auth/auth-api.ts` | rename `LoginResponse` → `AccessTokenResponse`, drop `refreshToken`; add `User`, `refresh()`, `me()` |
| `src/app/auth/auth-store.ts` + `.spec.ts` | new (`ng generate service auth/auth-store`) |
| `src/app/auth/auth-interceptor.ts` + `.spec.ts` | new (`ng generate interceptor auth/auth`, **not** `auth/auth-interceptor`, which produces `auth-interceptor-interceptor.ts`) |
| `src/app/app.config.ts` | `withInterceptors([authInterceptor])`, `provideAppInitializer(...)` |
| `src/app/auth/login/login.ts` + `.spec.ts` | use `AuthStore` and `Router`; remove `console.log` |
| `src/app/home/home.ts` (+ html/scss/spec) | new (`ng generate component home`) |
| `src/app/app.routes.ts` | add route `''` → `Home` (lazy) |

---

### Task 1: AuthApi types and AuthStore

**Mental model.** A store is a service that owns state. The writable signal is private, so only the store can call `.set()`; components get `.asReadonly()` and derived `computed()` values. The store turns cold Observables from `AuthApi` into Promises with `firstValueFrom`, because its callers (`async` form action, app initializer) await Promises.

**Read:** angular.dev → *Tutorials › Signals › Using signals with services* (`/tutorials/signals/7-using-signals-with-services`); *Guide › Signals › computed* (`/guide/signals`).

**Files:**
- Modify: `src/app/auth/auth-api.ts`
- Create: `src/app/auth/auth-store.ts`, `src/app/auth/auth-store.spec.ts`

**Interfaces (produced, later tasks rely on these exact names):**

```ts
// auth-api.ts
export interface LoginRequest { email: string; password: string }        // unchanged
export interface AccessTokenResponse { accessToken: string }
export interface User { id: number; email: string; username: string }

AuthApi.login(request: LoginRequest): Observable<AccessTokenResponse>   // POST /api/auth/login
AuthApi.refresh(): Observable<AccessTokenResponse>                       // POST /api/auth/refresh, body {} or null
AuthApi.me(): Observable<User>                                           // GET  /api/users/me

// auth-store.ts
AuthStore.accessToken: Signal<string | null>       // read-only
AuthStore.currentUser: Signal<User | null>         // read-only
AuthStore.isAuthenticated: Signal<boolean>         // currentUser() !== null
AuthStore.login(credentials: LoginRequest): Promise<void>
AuthStore.restoreSession(): Promise<void>
```

Naming hint: the private writable signal and the public read-only one cannot share a name. A common pattern is `private readonly _accessToken = signal<...>(null)` with `readonly accessToken = this._accessToken.asReadonly()`.

**Behaviour:**
- `login`: call `login()` → set token → call `me()` → set user. If `me()` fails: set the token back to `null`, rethrow. Errors from `AuthApi.login()` are rethrown unchanged (no wrapping).
- `restoreSession`: `refresh()` → set token → `me()` → set user. Any error: both `null`, resolve normally. Never rejects.

- [ ] **Step 1: Change `AuthApi`.** Rename the type, add `User`, `refresh()`, `me()`. Run `npx ng build` — expect success (`Login` uses the inferred type only).
- [ ] **Step 2: Generate the store.** `npx ng generate service auth/auth-store`. Check the generated decorator is `@Service()`.
- [ ] **Step 3: Write tests 1–4 first** in `auth-store.spec.ts`. Mock `AuthApi` with `{ login: vi.fn(), refresh: vi.fn(), me: vi.fn() }` via `{ provide: AuthApi, useValue: authApi }` (same pattern as `login.spec.ts`). Return `of(...)` for success, `throwError(() => new HttpErrorResponse({ status: 401 }))` for failure.

  | # | Given | When | Then |
  |---|---|---|---|
  | 1 | `login` → `{ accessToken: 'abc' }`, `me` → a `User` | `await store.login(creds)` | `accessToken()` is `'abc'`, `currentUser()` equals the user, `isAuthenticated()` is `true` |
  | 2 | `login` succeeds, `me` fails | `store.login(creds)` | the promise rejects (`await expect(...).rejects.toBeInstanceOf(HttpErrorResponse)`), `accessToken()` is `null`, `isAuthenticated()` is `false` |
  | 3 | `refresh` → `{ accessToken: 'abc' }`, `me` → a `User` | `await store.restoreSession()` | token and user are set |
  | 4 | `refresh` fails | `store.restoreSession()` | the promise resolves (`await expect(...).resolves.toBeUndefined()`), `isAuthenticated()` is `false`, `me` was not called |

- [ ] **Step 4: Run, expect red.** `npx ng test --watch=false --include src/app/auth/auth-store.spec.ts --reporters=verbose` → FAIL (methods do not exist).
- [ ] **Step 5: Implement the store** until 1–4 pass.
- [ ] **Step 6: Prove 2 and 4 can fail.** Temporarily delete the line that clears the token in `login`'s catch → test 2 must go red. Temporarily remove the `try/catch` in `restoreSession` → test 4 must go red. Restore both.
- [ ] **Step 7: Full suite green**, then commit:

```bash
git add src/app/auth/auth-api.ts src/app/auth/auth-store.ts src/app/auth/auth-store.spec.ts
git commit -m "feat(auth): add AuthStore with login and session restore"
```

---

### Task 2: authInterceptor

**Mental model.** An interceptor is a function on the request pipeline: it receives the request and `next`, and may return `next(modifiedClone)`. Requests are immutable, hence `req.clone({ setHeaders })`. A functional interceptor runs in an injection context *per request*, so `inject(AuthStore)` is resolved lazily, which is why the cycle `AuthStore → AuthApi → HttpClient → interceptor → AuthStore` does not break at construction.

**Read:** angular.dev → *Guide › HTTP › Interceptors* (`/guide/http/interceptors`, sections *Defining an interceptor* and *Configuring interceptors*); *Guide › HTTP › Testing* (`/guide/http/testing`, sections *Configuring HttpClient for testing*, *Expecting and answering requests*, *Testing an interceptor*).

**Files:**
- Create: `src/app/auth/auth-interceptor.ts`, `src/app/auth/auth-interceptor.spec.ts`
- Modify: `src/app/app.config.ts`

**Interfaces:**
- Consumes: `AuthStore.accessToken`, `AuthStore.login()` (Task 1).
- Produces: `export const authInterceptor: HttpInterceptorFn`.

- [ ] **Step 1: Generate.** `npx ng generate interceptor auth/auth` → `auth-interceptor.ts`, export `authInterceptor`.
- [ ] **Step 2: Write tests 5–6 first.** Use the **real** `AuthStore` and real `AuthApi` (no mocks), so the test also proves the dependency cycle resolves. Providers: `provideHttpClient(withInterceptors([authInterceptor]))`, `provideHttpClientTesting()`. Call `httpTesting.verify()` in `afterEach`.

  | # | Steps | Then |
  |---|---|---|
  | 5 | `const done = store.login(creds)`; `expectOne('/api/auth/login').flush({ accessToken: 'abc' })`; wait for the `/me` request; `await done` after flushing it | the `/api/users/me` request has header `Authorization` = `Bearer abc` |
  | 6 | `store.login(creds)` without flushing | the `/api/auth/login` request has no `Authorization` header (`req.request.headers.has('Authorization')` is `false`); flush it with an error or a value so `verify()` passes |

  Timing hint for 5: the `/me` request is sent only after the `login` promise continues, which happens on a later microtask. `expectOne` called immediately after the first flush will fail. Wait first (hint level 1: `await` something; ask for level 2 if stuck).

- [ ] **Step 3: Run, expect red** (header missing, because the interceptor is empty).
- [ ] **Step 4: Implement** the interceptor (spec Part 2 › Interceptor) and register it in `app.config.ts`.
- [ ] **Step 5: Prove 5 can fail.** Temporarily return `next(req)` unconditionally → 5 red, 6 still green. Restore.
- [ ] **Step 6: Full suite green**, commit:

```bash
git add src/app/auth/auth-interceptor.ts src/app/auth/auth-interceptor.spec.ts src/app/app.config.ts
git commit -m "feat(auth): attach access token with authInterceptor"
```

---

### Task 3: Login uses AuthStore

**Mental model.** The component stops knowing about tokens. It hands credentials to the store and maps errors to UI; the store decides what state changes. Because the store rethrows `HttpErrorResponse` unchanged, the existing `AUTH_001` branch keeps working.

**Read:** angular.dev → *Guide › Routing › Navigate to routes* (`/guide/routing/navigate-to-routes`, section *Router.navigate()*); *Guide › Testing › Provide service test doubles* (`/guide/testing/components-scenarios#provide-service-test-doubles`).

**Files:**
- Modify: `src/app/auth/login/login.ts`, `src/app/auth/login/login.spec.ts`

**Interfaces:**
- Consumes: `AuthStore.login(credentials): Promise<void>` (Task 1).
- `Login` no longer imports or injects `AuthApi`.

- [ ] **Step 1: Change the spec first.**
  - Mock becomes `authStore = { login: vi.fn() }` with `{ provide: AuthStore, useValue: authStore }`.
  - Success: `authStore.login.mockResolvedValue(undefined)`. `AUTH_001`: `mockRejectedValue(new HttpErrorResponse({ status: 401, error: { code: 'AUTH_001' } }))`.
  - Add `provideRouter([])` and spy: `const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)`.
  - Tests 7 (the three existing ones, same meaning) and 8:

  | # | Given | When | Then |
  |---|---|---|---|
  | 8 | valid email and password, `login` resolves | submit | `authStore.login` called with `{ email, password }`; `navigate` called with `['/']` |
  | 8b | `login` rejects with `AUTH_001` | submit | `navigate` **not** called (add this assertion to the existing AUTH_001 test) |

- [ ] **Step 2: Run, expect red** (`Login` still injects `AuthApi`, so the store mock is unused and `navigate` is never called).
- [ ] **Step 3: Implement.** Inject `AuthStore` and `Router`; `await authStore.login(...)`, then `await router.navigate(['/'])`; delete `console.log(tokens)`; remove the `AuthApi` and `firstValueFrom` imports if unused.
- [ ] **Step 4: Prove 8 can fail.** Comment out the navigate call → 8 red. Restore.
- [ ] **Step 5: Full suite green**, commit:

```bash
git add src/app/auth/login/login.ts src/app/auth/login/login.spec.ts
git commit -m "feat(auth): log in through AuthStore and navigate home"
```

---

### Task 4: Home, session restore on startup, browser check

**Mental model.** `provideAppInitializer` runs a function during bootstrap; if it returns a Promise, Angular waits for it before rendering the first route. That is why `restoreSession` must never reject: a rejected initializer stops the app from booting.

**Read:** angular.dev → API `provideAppInitializer` (`/api/core/provideAppInitializer`); *Guide › Routing › Define routes* (`/guide/routing/define-routes`, lazy `loadComponent`); `RouterLink` API (`/api/router/RouterLink`).

**Files:**
- Create: `src/app/home/home.ts`, `home.html`, `home.scss`, `home.spec.ts` (`npx ng generate component home`)
- Modify: `src/app/app.routes.ts`, `src/app/app.config.ts`

**Interfaces:**
- Consumes: `AuthStore.currentUser`, `AuthStore.restoreSession()`.

**Acceptance:**
- Route `''` lazy-loads `Home`, with a `title`.
- Logged in: shows the user's `username`. Logged out: a link to `/login` (`routerLink`, real `<a>`, visible text).
- `app.config.ts` has `provideAppInitializer(() => inject(AuthStore).restoreSession())`.

- [ ] **Step 1: Generate `Home`** and add the route. The generated `home.spec.ts` (`should create`) needs `provideRouter([])` because of `routerLink`; keep only that test (the spec defines no `Home` tests).
- [ ] **Step 2: Implement the template** with `@if` on `currentUser()`.
- [ ] **Step 3: Add the initializer.** Full suite green.
- [ ] **Step 4: Browser check** (backend running, `ng serve`), in the browser you normally use:
  1. Open `/` logged out → login link visible. Network: `POST /api/auth/refresh` → `401 AUTH_004`. No console error.
  2. Log in → lands on `/`, shows username. DevTools › Application › Cookies: `refresh_token` present with HttpOnly, Secure, SameSite=Strict, Path `/api/auth`.
  3. Reload → still shows username, `/refresh` → `200`, then `/me` → `200` with `Authorization: Bearer …`.
  4. Console: `document.cookie` does not contain `refresh_token`.
  5. If using Safari and step 2 shows no cookie: stop and report (spec Risks: dev-only `Secure` toggle).
  6. Stop the backend, reload → app renders logged out (proxy `502`), no blank screen.
- [ ] **Step 5: Commit:**

```bash
git add src/app/home/ src/app/app.routes.ts src/app/app.config.ts
git commit -m "feat(auth): restore session on startup and add Home"
```

---

### Task 5: Finish the slice

- [ ] Full suite: `npx ng test --watch=false` → expected 14 tests (6 existing + 4 store + 2 interceptor + 1 navigate + 1 home; the AUTH_001 test gains an assertion, not a new test). Report PASS/FAIL/SKIP.
- [ ] `npx ng build` succeeds.
- [ ] Update the spec status line to "frontend done" and strike step 3–4 of *Order of work*.
- [ ] Push `feat/auth-store`, open one PR against `master`.

## Out of scope (spec › Scope, later slices)

Refresh on `AUTH_003`, `AUTH_00x` handling, frontend logout, `AuthGuard`, startup timeout, cross-domain cookies.
