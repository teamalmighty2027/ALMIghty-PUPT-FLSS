import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnalyticsLoadAnalysisComponent } from './analytics-load-analysis.component';

describe('AnalyticsLoadAnalysisComponent', () => {
  let component: AnalyticsLoadAnalysisComponent;
  let fixture: ComponentFixture<AnalyticsLoadAnalysisComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsLoadAnalysisComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AnalyticsLoadAnalysisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
