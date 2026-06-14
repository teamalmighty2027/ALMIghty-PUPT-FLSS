import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AdminMainComponent } from './admin-main.component';
import { AuthService } from '../../../services/auth/auth.service';

describe('AdminMainComponent', () => {
  let component: AdminMainComponent;
  let fixture: ComponentFixture<AdminMainComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AdminMainComponent,
        HttpClientTestingModule,
        NoopAnimationsModule
      ],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            getUserName: () => 'Test Admin',
            getUserRole: () => 'admin',
            getUserEmail: () => 'admin@test.com',
            profilePictureUrl$: of(null)
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminMainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
