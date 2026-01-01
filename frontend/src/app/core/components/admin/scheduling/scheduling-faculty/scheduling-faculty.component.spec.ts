import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SchedulingFacultyComponent } from './scheduling-faculty.component';

describe('SchedulingFacultyComponent', () => {
  let component: SchedulingFacultyComponent;
  let fixture: ComponentFixture<SchedulingFacultyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SchedulingFacultyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SchedulingFacultyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
