import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { ReportProgramsComponent } from './report-programs.component';

describe('ReportProgramsComponent', () => {
  let component: ReportProgramsComponent;
  let fixture: ComponentFixture<ReportProgramsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportProgramsComponent, HttpClientTestingModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReportProgramsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
