import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { FacultyScheduleTimetableComponent } from './faculty-schedule-timetable.component';

describe('FacultyScheduleTimetableComponent', () => {
  let component: FacultyScheduleTimetableComponent;
  let fixture: ComponentFixture<FacultyScheduleTimetableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        FacultyScheduleTimetableComponent,
        HttpClientTestingModule,
        NoopAnimationsModule
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FacultyScheduleTimetableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
