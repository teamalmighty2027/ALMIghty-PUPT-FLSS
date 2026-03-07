import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuditLogComponent } from './audit-log.component';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('AuditLogComponent', () => {
  let component: AuditLogComponent;
  let fixture: ComponentFixture<AuditLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuditLogComponent, NoopAnimationsModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuditLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});