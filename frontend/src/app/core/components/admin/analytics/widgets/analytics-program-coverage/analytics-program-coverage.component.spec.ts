import { ComponentFixture, TestBed } from '@angular/core/testing';
import { 
  AnalyticsProgramCoverageComponent 
} from './analytics-program-coverage.component';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

describe('AnalyticsProgramCoverageComponent', () => {
  let component: AnalyticsProgramCoverageComponent;
  let fixture: ComponentFixture<AnalyticsProgramCoverageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsProgramCoverageComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideCharts(withDefaultRegisterables()),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsProgramCoverageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
