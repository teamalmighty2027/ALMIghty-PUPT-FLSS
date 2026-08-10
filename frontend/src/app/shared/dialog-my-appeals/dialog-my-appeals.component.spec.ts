import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { DialogMyAppealsComponent } from './dialog-my-appeals.component';

describe('DialogMyAppealsComponent', () => {
  let component: DialogMyAppealsComponent;
  let fixture: ComponentFixture<DialogMyAppealsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogMyAppealsComponent, HttpClientTestingModule],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: {} }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogMyAppealsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
