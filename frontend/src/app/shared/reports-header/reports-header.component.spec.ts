import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportsHeaderComponent } from './reports-header.component';

describe('ReportsHeaderComponent', () => {
  let component: ReportsHeaderComponent;
  let fixture: ComponentFixture<ReportsHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportsHeaderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReportsHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
