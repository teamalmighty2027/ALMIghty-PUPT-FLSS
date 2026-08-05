import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AcademicRanksComponent } from './academic-ranks.component';

describe('AcademicRanksComponent', () => {
  let component: AcademicRanksComponent;
  let fixture: ComponentFixture<AcademicRanksComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AcademicRanksComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AcademicRanksComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
