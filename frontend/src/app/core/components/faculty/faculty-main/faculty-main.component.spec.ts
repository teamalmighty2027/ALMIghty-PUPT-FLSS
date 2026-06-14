import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router, NavigationEnd } from '@angular/router';
import { FacultyMainComponent } from './faculty-main.component';
import { MatIconModule } from '@angular/material/icon';
import { of } from 'rxjs';
import { AuthService } from '../../../services/auth/auth.service';
import {
  FacultyService
} from
'../../../services/superadmin/management/faculty/faculty.service';

describe('FacultyMainComponent', () => {
  let component: FacultyMainComponent;
  let fixture: ComponentFixture<FacultyMainComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FacultyMainComponent, MatIconModule, RouterTestingModule],
      providers: [
        {
          provide: AuthService,
          useValue: {
            getUserName: () => 'Test Faculty',
            getUserEmail: () => 'faculty@test.com',
            getUserRole: () => 'Faculty',
            profilePictureUrl$: of(null),
            logout: () => of(null)
          }
        },
        {
          provide: FacultyService,
          useValue: {
            getProfile: () => of({ profile_picture_url: 'test-url' })
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(FacultyMainComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);

    // Mock the NavigationEnd event for Router
    spyOn(router.events, 'pipe').and.returnValue(
      of(new NavigationEnd(0, '', '')),
    );

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
