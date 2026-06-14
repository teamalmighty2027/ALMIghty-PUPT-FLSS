import { waitForAsync, ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { SuperadminMainComponent } from './superadmin-main.component';
import { AuthService } from '../../../services/auth/auth.service';

describe('SuperadminMainComponent', () => {
  let component: SuperadminMainComponent;
  let fixture: ComponentFixture<SuperadminMainComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [
        SuperadminMainComponent,
        NoopAnimationsModule,
        HttpClientTestingModule
      ],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            getUserName: () => 'Test Superadmin',
            getUserRole: () => 'superadmin',
            getUserEmail: () => 'superadmin@test.com',
            profilePictureUrl$: of(null)
          }
        }
      ]
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SuperadminMainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should compile', () => {
    expect(component).toBeTruthy();
  });
});
