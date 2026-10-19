import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { TableDialogComponent } from './table-dialog.component';
import { AdminService } from '../../core/services/superadmin/management/admin/admin.service';

describe('TableDialogComponent', () => {
  let component: TableDialogComponent;
  let fixture: ComponentFixture<TableDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: { fields: [] } },
        {
          provide: AdminService,
          useValue: jasmine.createSpyObj('AdminService', ['getNextAdminCode'])
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TableDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
