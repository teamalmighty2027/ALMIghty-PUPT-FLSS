import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogAdminPermissionComponent } from './dialog-admin-permission.component';

describe('DialogAdminPermissionComponent', () => {
  let component: DialogAdminPermissionComponent;
  let fixture: ComponentFixture<DialogAdminPermissionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogAdminPermissionComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogAdminPermissionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
