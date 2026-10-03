import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthApi } from '../auth-api';
import { Login } from './login';
import { throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let authApi: { login: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authApi = { login: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [{ provide: AuthApi, useValue: authApi }],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not call login when the form is empty', async () => {
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');

    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(authApi.login).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelectorAll('[role="alert"]').length).toBe(2);
  });

  it('should show credentials error when API returns AUTH_001', async () => {
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    component.loginModel.set({ email: 'test@example.com', password: 'wrong' });
    authApi.login.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            error: { code: 'AUTH_001' },
          }),
      ),
    );

    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(authApi.login).toHaveBeenCalledWith({ email: 'test@example.com', password: 'wrong' });
    expect(fixture.nativeElement.querySelectorAll('[role="alert"]').length).toBe(1);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Invalid email or password',
    );
  });
});
