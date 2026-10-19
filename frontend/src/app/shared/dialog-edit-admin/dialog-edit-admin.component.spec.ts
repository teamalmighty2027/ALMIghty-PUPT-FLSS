import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { DialogEditAdminComponent } from './dialog-edit-admin.component';

describe('DialogEditAdminComponent', () => {
  let component: DialogEditAdminComponent;
  let fixture: ComponentFixture<DialogEditAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogEditAdminComponent],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            admin: {
              id: '1',
              code: 'ADM001TG2024',
              last_name: 'Ferrer',
              first_name: 'Marissa',
              middle_name: 'B.',
              suffix_name: '',
              email: 'marissa.ferrer@example.com',
              status: 'Active',
              role: 'admin',
            },
          },
        },
        {
          provide: MatDialogRef,
          useValue: { close: jasmine.createSpy('close') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogEditAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render the edit form header and action button', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    expect(component).toBeTruthy();
    expect(compiled.textContent).toContain('Edit Admin Details');
    expect(compiled.textContent).toContain('Update Admin');
    expect(compiled.querySelector('input[formcontrolname="last_name"]')).not.toBeNull();
  });
});
