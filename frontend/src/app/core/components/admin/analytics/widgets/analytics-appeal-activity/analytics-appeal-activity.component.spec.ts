import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnalyticsAppealActivityComponent } from './analytics-appeal-activity.component';

describe('AnalyticsAppealActivityComponent', () => {
  let component: AnalyticsAppealActivityComponent;
  let fixture: ComponentFixture<AnalyticsAppealActivityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsAppealActivityComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AnalyticsAppealActivityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
