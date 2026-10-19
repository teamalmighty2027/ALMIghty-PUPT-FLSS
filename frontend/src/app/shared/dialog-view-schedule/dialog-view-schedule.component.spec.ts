import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { DialogViewScheduleComponent } from './dialog-view-schedule.component';

describe('DialogViewScheduleComponent', () => {
  let component: DialogViewScheduleComponent;
  let fixture: ComponentFixture<DialogViewScheduleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        DialogViewScheduleComponent,
        HttpClientTestingModule,
        NoopAnimationsModule
      ],
      providers: [
        {
          provide: MatDialogRef,
          useValue: {
            close: () => {},
            backdropClick: () => of(new MouseEvent('click')),
            keydownEvents: () => of(new KeyboardEvent('keydown'))
          }
        },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            entity: 'Faculty',
            generatePdfFunction: () => new Blob()
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogViewScheduleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
