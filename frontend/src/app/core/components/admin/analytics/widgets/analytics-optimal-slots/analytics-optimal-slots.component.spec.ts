import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnalyticsOptimalSlotsComponent } from './analytics-optimal-slots.component';

describe('AnalyticsOptimalSlotsComponent', () => {
  let component: AnalyticsOptimalSlotsComponent;
  let fixture: ComponentFixture<AnalyticsOptimalSlotsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsOptimalSlotsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AnalyticsOptimalSlotsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
