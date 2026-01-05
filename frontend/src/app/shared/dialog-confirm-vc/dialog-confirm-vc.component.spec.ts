import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogConfirmVcComponent } from './dialog-confirm-vc.component';

describe('DialogConfirmVcComponent', () => {
  let component: DialogConfirmVcComponent;
  let fixture: ComponentFixture<DialogConfirmVcComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogConfirmVcComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogConfirmVcComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
