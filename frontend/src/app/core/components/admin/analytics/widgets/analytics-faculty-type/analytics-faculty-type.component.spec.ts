import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  AnalyticsFacultyTypeComponent
} from './analytics-faculty-type.component';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

describe('AnalyticsFacultyTypeComponent', () => {
  let component: AnalyticsFacultyTypeComponent;
  let fixture: ComponentFixture<AnalyticsFacultyTypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsFacultyTypeComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideCharts(withDefaultRegisterables()),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsFacultyTypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
