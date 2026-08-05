import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { DialogPrefSectionComponent } from './dialog-pref-section.component';

describe('DialogPrefSectionComponent', () => {
  let component: DialogPrefSectionComponent;
  let fixture: ComponentFixture<DialogPrefSectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogPrefSectionComponent],
      providers: [
        {
          provide: MatDialogRef,
          useValue: {
            backdropClick: () => of(null),
            close: () => {}
          }
        },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            sections: [],
            programCode: '',
            courseCode: '',
            courseTitle: ''
          }
        }
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
