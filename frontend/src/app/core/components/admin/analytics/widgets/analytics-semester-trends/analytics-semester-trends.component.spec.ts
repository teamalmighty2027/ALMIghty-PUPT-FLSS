import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  AnalyticsSemesterTrendsComponent
} from './analytics-semester-trends.component';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

describe('AnalyticsSemesterTrendsComponent', () => {
  let component: AnalyticsSemesterTrendsComponent;
  let fixture: ComponentFixture<AnalyticsSemesterTrendsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsSemesterTrendsComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideCharts(withDefaultRegisterables()),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsSemesterTrendsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
