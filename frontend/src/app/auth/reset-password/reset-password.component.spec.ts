import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ResetPasswordComponent } from './reset-password.component';
import { AuthService } from '../../core/services/auth/auth.service';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';

describe('ResetPasswordComponent', () => {
  let component: ResetPasswordComponent;
  let fixture: ComponentFixture<ResetPasswordComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResetPasswordComponent, NoopAnimationsModule],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => 'dummy-token' },
              queryParamMap: { get: () => 'dummy@email.com' }
            }
          }
        },
        {
          provide: Router,
          useValue: jasmine.createSpyObj('Router', ['navigate'])
        },
        {
          provide: MatSnackBar,
          useValue: jasmine.createSpyObj('MatSnackBar', ['open'])
        },
        {
          provide: AuthService,
          useValue: {
            verifyResetToken: () => of({}),
            resetPassword: () => of({})
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
