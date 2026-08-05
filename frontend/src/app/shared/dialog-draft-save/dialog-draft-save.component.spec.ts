import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { DialogDraftSaveComponent } from './dialog-draft-save.component';

describe('DialogDraftSaveComponent', () => {
  let component: DialogDraftSaveComponent;
  let fixture: ComponentFixture<DialogDraftSaveComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogDraftSaveComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            dirtyEntries: [],
            skippedEntries: [],
            saveStream$: of()
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogDraftSaveComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
