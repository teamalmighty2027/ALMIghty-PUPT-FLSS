import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';

import { DialogActionComponent } from './dialog-action.component';

describe('DialogActionComponent', () => {
  let component: DialogActionComponent;
  let fixture: ComponentFixture<DialogActionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogActionComponent, HttpClientTestingModule],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { type: 'all_publish', currentState: false }
        },
        {
          provide: MatSnackBar,
          useValue: jasmine.createSpyObj('MatSnackBar', ['open'])
        },
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogActionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
