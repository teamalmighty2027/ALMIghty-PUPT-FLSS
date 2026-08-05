import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { DialogRedirectComponent } from './dialog-redirect.component';

describe('DialogRedirectComponent', () => {
  let component: DialogRedirectComponent;
  let fixture: ComponentFixture<DialogRedirectComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        DialogRedirectComponent,
        HttpClientTestingModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { checkingIDP: true, redirecting: false, intendedRole: [] }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogRedirectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
