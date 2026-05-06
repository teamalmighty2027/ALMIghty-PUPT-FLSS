import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportFacultyAssignmentComponent } from './report-faculty-assignment.component';

describe('ReportFacultyAssignmentComponent', () => {
  let component: ReportFacultyAssignmentComponent;
  let fixture: ComponentFixture<ReportFacultyAssignmentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportFacultyAssignmentComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReportFacultyAssignmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
