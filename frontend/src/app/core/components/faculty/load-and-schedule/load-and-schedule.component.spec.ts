import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { LoadAndScheduleComponent } from './load-and-schedule.component';

describe('LoadAndScheduleComponent', () => {
  let component: LoadAndScheduleComponent;
  let fixture: ComponentFixture<LoadAndScheduleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        LoadAndScheduleComponent,
        HttpClientTestingModule,
        NoopAnimationsModule
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoadAndScheduleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
