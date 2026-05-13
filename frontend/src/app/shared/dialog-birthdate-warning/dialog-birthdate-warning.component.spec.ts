import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogBirthdateWarningComponent } from './dialog-birthdate-warning.component';

describe('DialogBirthdateWarningComponent', () => {
  let component: DialogBirthdateWarningComponent;
  let fixture: ComponentFixture<DialogBirthdateWarningComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogBirthdateWarningComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogBirthdateWarningComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
