import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SchedulingProgramsComponent } from './scheduling-programs.component';

describe('SchedulingProgramsComponent', () => {
  let component: SchedulingProgramsComponent;
  let fixture: ComponentFixture<SchedulingProgramsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SchedulingProgramsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SchedulingProgramsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
