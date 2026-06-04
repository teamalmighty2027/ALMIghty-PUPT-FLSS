import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnalyticsHeatmapComponent } from './analytics-heatmap.component';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('AnalyticsHeatmapComponent', () => {
  let component: AnalyticsHeatmapComponent;
  let fixture: ComponentFixture<AnalyticsHeatmapComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsHeatmapComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsHeatmapComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
