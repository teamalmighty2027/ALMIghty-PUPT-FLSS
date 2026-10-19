import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SystemNoticesComponent } from './system-notices.component';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('SystemNoticesComponent', () => {
  let component: SystemNoticesComponent;
  let fixture: ComponentFixture<SystemNoticesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        SystemNoticesComponent,
        HttpClientTestingModule,
        MatDialogModule,
        MatSnackBarModule,
        NoopAnimationsModule,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SystemNoticesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
