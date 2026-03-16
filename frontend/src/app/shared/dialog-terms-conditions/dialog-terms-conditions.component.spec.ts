import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogTermsConditionsComponent } from './dialog-terms-conditions.component';

describe('DialogTermsConditionsComponent', () => {
  let component: DialogTermsConditionsComponent;
  let fixture: ComponentFixture<DialogTermsConditionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogTermsConditionsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogTermsConditionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
