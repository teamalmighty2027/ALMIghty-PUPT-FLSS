import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router, NavigationEnd } from '@angular/router';
import { FacultyMainComponent } from './faculty-main.component';
import { MatIconModule } from '@angular/material/icon';
import { of } from 'rxjs';

describe('FacultyMainComponent', () => {
  let component: FacultyMainComponent;
  let fixture: ComponentFixture<FacultyMainComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FacultyMainComponent, MatIconModule, RouterTestingModule],
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
