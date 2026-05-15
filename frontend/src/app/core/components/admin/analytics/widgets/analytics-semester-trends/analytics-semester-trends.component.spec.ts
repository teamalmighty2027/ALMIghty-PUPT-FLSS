import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnalyticsSemesterTrendsComponent } from './analytics-semester-trends.component';

describe('AnalyticsSemesterTrendsComponent', () => {
  let component: AnalyticsSemesterTrendsComponent;
  let fixture: ComponentFixture<AnalyticsSemesterTrendsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsSemesterTrendsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AnalyticsSemesterTrendsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
