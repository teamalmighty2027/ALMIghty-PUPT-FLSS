import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogPrefSectionComponent } from './dialog-pref-section.component';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

describe('DialogPrefSectionComponent', () => {
  let component: DialogPrefSectionComponent;
  let fixture: ComponentFixture<DialogPrefSectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogPrefSectionComponent],
      providers: [
        { provide: MatDialogRef, useValue: {} },
        { provide: MAT_DIALOG_DATA, useValue: { sections: [], programCode: '', courseCode: '', courseTitle: '' } }
      ]
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
