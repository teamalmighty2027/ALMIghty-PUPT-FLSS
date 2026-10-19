import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { ReportFacultyComponent } from './report-faculty.component';

describe('ReportFacultyComponent', () => {
  let component: ReportFacultyComponent;
  let fixture: ComponentFixture<ReportFacultyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportFacultyComponent, HttpClientTestingModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReportFacultyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
