import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { DialogAdminPermissionComponent } from './dialog-admin-permission.component';

describe('DialogAdminPermissionComponent', () => {
  let component: DialogAdminPermissionComponent;
  let fixture: ComponentFixture<DialogAdminPermissionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogAdminPermissionComponent, HttpClientTestingModule],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { adminId: 1, adminName: 'Test Admin' }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DialogAdminPermissionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
