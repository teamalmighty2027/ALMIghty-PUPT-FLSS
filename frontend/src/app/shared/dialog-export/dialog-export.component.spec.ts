import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick
} from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { DialogExportComponent } from './dialog-export.component';

describe('DialogExportComponent', () => {
  let component: DialogExportComponent;
  let fixture: ComponentFixture<DialogExportComponent>;

  beforeEach(fakeAsync(() => {
    TestBed.configureTestingModule({
      imports: [DialogExportComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            exportType: 'single',
            generatePdfFunction: () => new Blob()
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogExportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    tick();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
