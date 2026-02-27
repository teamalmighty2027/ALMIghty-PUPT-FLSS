import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReschedulingComponent } from './rescheduling.component';
import { ReschedulingService } from '../../../services/faculty/rescheduling/rescheduling.service';
import { MatDialog } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

// 1. Create a Dummy Service
class MockReschedulingService {
  getAllAppeals() {
    // Return an empty array or dummy data
    return of([
      {
        appeal_id: 1,
        faculty_name: 'John Doe',
        program_code: 'BSIT',
        course_title: 'Web Dev',
        original_day: 'Monday',
        original_start_time: '08:00',
        original_end_time: '10:00',
        is_approved: null // Pending
      }
    ]);
  }

  approveAppeal() { return of({}); }
  denyAppeal() { return of({}); }
}

describe('ReschedulingComponent', () => {
  let component: ReschedulingComponent;
  let fixture: ComponentFixture<ReschedulingComponent>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;

  beforeEach(async () => {
    // 2. Create a Spy for MatDialog
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open', 'closeAll']);

    await TestBed.configureTestingModule({
      imports: [
        ReschedulingComponent,
        NoopAnimationsModule // Important for Material components in tests
      ],
      providers: [
        // Provide our mocks instead of real services
        { provide: ReschedulingService, useClass: MockReschedulingService },
        { provide: MatDialog, useValue: dialogSpy }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReschedulingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load appeals into dataSource on init', () => {
    // We expect the mock data to be loaded into the table source
    expect(component.dataSource.data.length).toBeGreaterThan(0);
    expect(component.dataSource.data[0].facultyName).toBe('John Doe');
  });

  it('should generate time options', () => {
    expect(component.timeOptions.length).toBeGreaterThan(0);
  });

  it('should open dialog when review is clicked', () => {
    const mockAppeal = component.dataSource.data[0];
    
    // Call the new method name
    component.openEditDialog(mockAppeal);
    
    // Check if the Dialog Service was called
    expect(dialogSpy.open).toHaveBeenCalled();
    // Check if selectedAppeal was set
    expect(component.selectedAppeal).toEqual(jasmine.objectContaining({
      facultyName: 'John Doe'
    }));
  });

  it('should close dialog', () => {
    // Call the new method name
    component.closeDialog();
    
    // Check if dialog.closeAll() was called
    expect(dialogSpy.closeAll).toHaveBeenCalled();
    expect(component.selectedAppeal).toBeNull();
  });

  it('should have original schedule data mapped correctly', () => {
    const mockAppeal = component.dataSource.data[0];
    expect(mockAppeal.originalDay).toBe('Monday');
    expect(mockAppeal.originalStartTime).toBeDefined();
  });
});