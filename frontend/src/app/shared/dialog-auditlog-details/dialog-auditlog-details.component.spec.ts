import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogAuditlogDetailsComponent } from './dialog-auditlog-details.component';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

describe('DialogAuditlogDetailsComponent', () => {
  let component: DialogAuditlogDetailsComponent;
  let fixture: ComponentFixture<DialogAuditlogDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogAuditlogDetailsComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { action_type: 'UPDATE', user: 'Admin', role: 'Superadmin' } },
        { provide: MatDialogRef, useValue: { close: () => {} } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DialogAuditlogDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});