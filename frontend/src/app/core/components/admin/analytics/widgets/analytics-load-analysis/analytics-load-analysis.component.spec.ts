import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  AnalyticsLoadAnalysisComponent
} from './analytics-load-analysis.component';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

describe('AnalyticsLoadAnalysisComponent', () => {
  let component: AnalyticsLoadAnalysisComponent;
  let fixture: ComponentFixture<AnalyticsLoadAnalysisComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsLoadAnalysisComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideCharts(withDefaultRegisterables()),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsLoadAnalysisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
