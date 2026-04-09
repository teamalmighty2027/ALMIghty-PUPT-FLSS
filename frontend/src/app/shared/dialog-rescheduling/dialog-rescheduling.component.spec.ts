import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogReschedulingComponent } from './dialog-rescheduling.component';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('DialogReschedulingComponent', () => {
  let component: DialogReschedulingComponent;
  let fixture: ComponentFixture<DialogReschedulingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogReschedulingComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: { appeal: {}, timeOptions: [] } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DialogReschedulingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});