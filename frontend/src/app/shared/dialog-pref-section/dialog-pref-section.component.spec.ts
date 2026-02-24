import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogPrefSectionComponent } from './dialog-pref-section.component';

describe('DialogPrefSectionComponent', () => {
  let component: DialogPrefSectionComponent;
  let fixture: ComponentFixture<DialogPrefSectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogPrefSectionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogPrefSectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
