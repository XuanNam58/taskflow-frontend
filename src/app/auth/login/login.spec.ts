import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Login } from './login';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthStore } from '../auth-store';
import { provideRouter, Router } from '@angular/router';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let authStore: { login: ReturnType<typeof vi.fn> };
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    authStore = { login: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [{ provide: AuthStore, useValue: authStore },
      provideRouter([])
      ],
    }).compileComponents();

    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
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

    expect(authStore.login).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelectorAll('[role="alert"]').length).toBe(2);
  });

  it('should show credentials error when login rejects with AUTH_001', async () => {
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    component.loginModel.set({ email: 'test@example.com', password: 'wrong' });

    authStore.login.mockRejectedValue(
      new HttpErrorResponse({
        status: 401,
        error: { code: 'AUTH_001' }
      }),
    );

    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(authStore.login).toHaveBeenCalledWith({ email: 'test@example.com', password: 'wrong' });
    expect(fixture.nativeElement.querySelectorAll('[role="alert"]').length).toBe(1);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Invalid email or password',
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('should navigate home after a successful login', async () => {
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    component.loginModel.set({ email: 'test@example.com', password: 'valid' });

    authStore.login.mockResolvedValue(undefined);

    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(authStore.login).toHaveBeenCalledWith({ email: 'test@example.com', password: 'valid' });
    expect(navigate).toHaveBeenCalledWith(['/']);
  });
});
