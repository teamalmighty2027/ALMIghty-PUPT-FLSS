import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogSystemNoticeDetailsComponent } from './dialog-system-notice-details.component';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';

describe('DialogSystemNoticeDetailsComponent', () => {
  let component: DialogSystemNoticeDetailsComponent;
  let fixture: ComponentFixture<DialogSystemNoticeDetailsComponent>;

  const mockNotice = {
    id: 1,
    type: 'reactivation_request',
    severity: 'info' as const,
    source: 'backend' as const,
    title: 'Test Title',
    message: 'Test Message',
    created_at: '2026-08-05T00:00:00Z',
    updated_at: '2026-08-05T00:00:00Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        DialogSystemNoticeDetailsComponent,
        HttpClientTestingModule,
        MatDialogModule,
        MatSnackBarModule,
      ],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: mockNotice },
        { provide: MatDialogRef, useValue: { close: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogSystemNoticeDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
