# AuthStore và refresh token qua cookie httpOnly

- Ngày: 2026-10-04
- Trạng thái: chờ duyệt
- Repo bị ảnh hưởng: `taskflow-backend`, `taskflow-frontend`

## Mục tiêu

Sau khi đăng nhập, app nhớ được người dùng là ai, kể cả khi reload trang, mà không để lộ refresh token cho JavaScript.

## Hiện trạng

- `POST /api/auth/login` trả `{ accessToken, refreshToken }` trong JSON body.
- `/refresh` và `/logout` nhận refresh token trong body.
- Access token sống 15 phút, refresh token sống 30 ngày, có rotation. Token đã rotate bị từ chối (`401 AUTH_006`), nhưng **chưa có phát hiện tái sử dụng**: token mới thay thế nó vẫn hợp lệ. Việc này nằm trong backlog bắt buộc trước khi deploy công khai.
- `GET /api/users/me` cần header `Authorization: Bearer <access token>`.
- Frontend: `Login` gọi `AuthApi.login()` rồi `console.log` token. Token chưa được lưu ở đâu.
- Backend tắt CSRF (`csrf.disable()`), chạy stateless.

## Phạm vi

| Có trong slice này | Để slice sau |
|---|---|
| Refresh token chuyển sang cookie `httpOnly` | Tự refresh khi gặp 401, xử lý các mã `AUTH_00x` |
| `AuthStore`: access token trong memory, `currentUser`, `isAuthenticated` | Logout ở frontend |
| Khôi phục phiên khi khởi động app | `AuthGuard` |
| Interceptor tối giản: gắn header `Authorization` | Timeout cho request khởi động |
| `Login` lưu vào store và chuyển trang | Triển khai frontend, backend ở hai domain khác nhau |
| `Home` tối giản tại route `''` | |

## Phần 1: Backend

### Nguyên tắc

Cookie là chi tiết của tầng HTTP, nên chỉ `AuthController` biết đến cookie. `AuthService` giữ nguyên: vẫn nhận `RefreshTokenRequest`, `LogoutRequest` và trả về cặp token. Controller đọc cookie để dựng DTO cho service, và tách refresh token từ kết quả của service để ghi vào cookie.

### Cookie

```
refresh_token=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=<refreshTokenExpiration>
```

| Thuộc tính | Lý do |
|---|---|
| `HttpOnly` | JavaScript không đọc được, XSS không lấy được token |
| `Secure` | Chỉ gửi qua HTTPS. Chrome và Firefox coi `http://localhost` là môi trường an toàn |
| `SameSite=Strict` | Trang khác không làm trình duyệt gửi kèm cookie. Đây là lớp chống CSRF, nên giữ `csrf.disable()` |
| `Path=/api/auth` | Cookie chỉ đi kèm request auth |
| `Max-Age` | Lấy từ `JwtProperties.refreshTokenExpiration` có sẵn |

Dựng bằng `org.springframework.http.ResponseCookie`, không thêm thư viện.

Cookie xoá phải trùng `Path=/api/auth` với cookie đã ghi: trình duyệt nhận diện cookie theo name + domain + path (RFC 6265 §5.3, bước 11). Cookie ghi và cookie xoá dựng từ cùng một chỗ, chỉ khác `Max-Age`.

### Endpoint

| Endpoint | Request | Response |
|---|---|---|
| `POST /api/auth/login` | không đổi | ghi cookie, body `{ accessToken }` |
| `POST /api/auth/refresh` | không có body, đọc cookie `refresh_token` | ghi cookie mới (rotation), body `{ accessToken }` |
| `POST /api/auth/logout` | không có body, đọc cookie `refresh_token`, vẫn cần access token | xoá cookie bằng `Max-Age=0`, `204` |
| `POST /api/auth/logout-all` | không đổi | xoá cookie bằng `Max-Age=0`, `204` |
| `/register` | không đổi | không đổi |

`/logout` phải sửa ngay trong slice này: frontend không còn đọc được refresh token để gửi qua body.

Khi `/logout` hoặc `/refresh` thất bại, response lỗi không xoá cookie. Cookie chết nằm lại đến hết `Max-Age`, lần khởi động sau nhận `401` và app ở trạng thái chưa đăng nhập. Chấp nhận trong slice này.

DTO mới: `AccessTokenResponse(String accessToken)`, dùng chung cho `/login` và `/refresh`. `RefreshTokenRequest` và `LogoutRequest` giữ lại cho service, controller tự dựng chúng từ cookie.

### Lỗi

`/refresh` hoặc `/logout` không có cookie: ném `BusinessException(ErrorCode.INVALID_REFRESH_TOKEN)`, tức `401 AUTH_004`. Đọc cookie bằng `@CookieValue(name = "refresh_token", required = false)` để không rơi vào `MissingRequestCookieException` (400, không có `code`).

Với `/refresh`, đây là đường đi bình thường mỗi lần app khởi động khi người dùng chưa đăng nhập.

### Test backend

Cập nhật `AuthControllerIntegrationTest`:

1. Login: có `Set-Cookie` với đủ thuộc tính ở trên. Body không có `refreshToken`.
2. Refresh có cookie: `200`, có cookie mới, giá trị khác cookie cũ.
3. Refresh không có cookie: `401 AUTH_004`. Test này xanh cả khi chưa có check, vì `findByTokenForUpdate(null)` sinh `where token = NULL`, không khớp dòng nào. Vẫn viết check tường minh, đừng lấy test xanh làm bằng chứng.
4. Dùng lại cookie đã bị rotate: `401 AUTH_006`.
5. Logout: cookie bị xoá, `Max-Age=0` và `Path=/api/auth`.
6. Logout-all: cookie bị xoá như trên.

Cập nhật `docs/postman/taskflow-auth.postman_collection.json` và `src/test/http/auth.http`: bỏ `refreshToken` khỏi body của `/refresh` và `/logout`. Sửa mã mong đợi của request "dùng lại refresh token đã rotate" từ `AUTH_005` thành `AUTH_006` (`AUTH_005` là hết hạn).

### Rủi ro

Safari có thể không nhận cookie `Secure` trên `http://localhost`. Giữ `Secure` cố định. Kế hoạch có bước kiểm tra cookie được lưu trên trình duyệt đang dùng. Chỉ khi bước đó thất bại mới thêm cấu hình tắt `Secure` cho môi trường dev.

Cookie jar của curl và Postman có thể xử lý cookie `Secure` trên `http` khác trình duyệt. Nếu cookie không được gửi lại, truyền tay `-H 'Cookie: refresh_token=...'` trước khi kết luận code sai.

**Refresh đồng thời với cùng một cookie.** Cookie dùng chung giữa các tab. Hai tab khởi động cùng lúc, hoặc F5 hai lần liên tiếp, gửi cùng cookie lên `/refresh`. Lock bi quan bắt request thứ hai chờ, rồi nó thấy token đã bị thu hồi và nhận `AUTH_006`, nên tab đó khởi động ở trạng thái chưa đăng nhập. Nếu trình duyệt huỷ request đầu trước khi xử lý `Set-Cookie`, cookie còn lại là token đã chết và người dùng bị đăng xuất hẳn. Giới hạn đã biết, không sửa trong slice này. Đây là câu hỏi grace window trong roadmap, và phải giải trước khi làm phát hiện tái sử dụng, nếu không một lần F5 đôi sẽ thu hồi mọi phiên.

## Phần 2: Frontend

### Các đơn vị

| File | Trách nhiệm | Phụ thuộc |
|---|---|---|
| `AuthApi` (sửa) | HTTP thuần. `login()` trả `{ accessToken }`, thêm `refresh()` và `me()` | `HttpClient` |
| `AuthStore` (mới) | Giữ trạng thái đăng nhập, điều phối login và khôi phục phiên | `AuthApi` |
| `authInterceptor` (mới) | Gắn `Authorization: Bearer <token>` khi có token | `AuthStore` |
| `Login` (sửa) | Form và hiển thị lỗi. Gọi `AuthStore.login()` rồi chuyển về `/` | `AuthStore`, `Router` |
| `Home` (mới) | Route `''`. Hiện `username` nếu đã đăng nhập, ngược lại hiện link tới `/login` | `AuthStore` |

### Kiểu dữ liệu

```ts
interface AccessTokenResponse { accessToken: string }
interface User { id: number; email: string; username: string }
```

`User` chỉ khai báo field UI dùng. Backend trả thêm `enabled`, `createdAt`, `modifiedAt`, không ảnh hưởng.

### AuthStore

```
private, ghi được
  accessToken : signal<string | null>
  currentUser : signal<User | null>

public, chỉ đọc
  accessToken
  currentUser
  isAuthenticated = computed(() => currentUser() !== null)

method
  login(credentials: LoginRequest): Promise<void>
  restoreSession(): Promise<void>
```

- Decorator `@Service()`.
- Bên ngoài chỉ đọc state. Mọi thay đổi trạng thái đi qua method của store.
- Method trả `Promise`, vì nơi gọi là action `async` của form và app initializer. Bên trong dùng `firstValueFrom`.

### Luồng login

```
Login.action
  → authStore.login(credentials)
      → AuthApi.login()  → set accessToken
      → AuthApi.me()     → set currentUser      (interceptor gắn token)
  → router.navigate(['/'])
```

Tất cả hoặc không gì cả: nếu `me()` thất bại, store đặt `accessToken` về `null` rồi ném lỗi tiếp. Không bao giờ có trạng thái có token mà không có user.

Store không nuốt lỗi của `login()`. `HttpErrorResponse` đi nguyên vẹn lên `Login`, phần ánh xạ `AUTH_001` giữ nguyên.

### Luồng khởi động

```
app.config.ts
  provideAppInitializer(() => inject(AuthStore).restoreSession())

restoreSession
  → AuthApi.refresh() → set accessToken
  → AuthApi.me()      → set currentUser
  lỗi bất kỳ          → cả hai về null, không ném lỗi
```

- `provideAppInitializer` chặn render đến khi promise xong, nên trang đầu tiên luôn thấy đúng trạng thái.
- `restoreSession` không bao giờ ném lỗi. Chưa đăng nhập, cookie hết hạn, backend tắt đều là tình huống bình thường.
- Cookie tự đi kèm `/refresh` vì qua proxy dev, mọi request đều cùng origin `localhost:4200`. Không cần `withCredentials`.

### Interceptor

```ts
const token = inject(AuthStore).accessToken();
return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
```

Đăng ký trong `app.config.ts`: `provideHttpClient(withInterceptors([authInterceptor]))`.

Vòng phụ thuộc `AuthStore → AuthApi → HttpClient → interceptor → AuthStore` không gây lỗi khi khởi tạo, vì functional interceptor chỉ gọi `inject()` khi có request. Test interceptor phải xác nhận điều này.

### Xử lý lỗi

| Tình huống | Kết quả |
|---|---|
| Sai mật khẩu | `AUTH_001` lên `Login`, hiện message như hiện tại |
| `me()` lỗi sau khi login được | Store xoá token, `Login` hiện message chung |
| Khởi động, không có cookie | `401 AUTH_004`, app khởi động ở trạng thái chưa đăng nhập |
| Khởi động, backend tắt | Proxy trả `502`, app khởi động ở trạng thái chưa đăng nhập |
| Khởi động, backend treo | App đứng ở màn hình trắng. Giới hạn đã biết, xem Phạm vi |

### Gỡ bỏ

- Field `refreshToken` trong kiểu `LoginResponse`. Đổi tên kiểu thành `AccessTokenResponse`.
- `console.log(tokens)` trong `Login`.
- `Login` không còn inject `AuthApi`.

### Test frontend

`AuthStore`, mock `AuthApi`:
1. `login()` thành công: có `accessToken` và `currentUser`, `isAuthenticated` là `true`.
2. `me()` lỗi trong `login()`: `accessToken` là `null`, lỗi được ném ra.
3. `restoreSession()` thành công: có token và user.
4. `restoreSession()` khi `refresh()` lỗi: không ném lỗi, `isAuthenticated` là `false`.

`authInterceptor`, dùng `HttpTestingController`:
5. Có token: request có header `Authorization: Bearer <token>`.
6. Không có token: request không có header `Authorization`.

`Login`, đổi mock từ `AuthApi` sang `AuthStore`:
7. Hai test hiện có giữ nguyên ý nghĩa.
8. Login thành công: `router.navigate` được gọi với `['/']`.

## Thứ tự thực hiện

1. Backend, kèm test backend.
2. Kiểm tra bằng Postman hoặc `curl`: cookie được ghi và xoá đúng.
3. Frontend, kèm test frontend.
4. Kiểm tra trên trình duyệt: đăng nhập, reload vẫn còn đăng nhập, cookie không đọc được bằng `document.cookie`.
