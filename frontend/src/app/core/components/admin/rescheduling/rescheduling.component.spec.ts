import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReschedulingComponent } from './rescheduling.component';

describe('ReschedulingComponent', () => {
  let component: ReschedulingComponent;
  let fixture: ComponentFixture<ReschedulingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReschedulingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReschedulingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load pending appeals on init', () => {
    expect(component.pendingAppeals.length).toBeGreaterThan(0);
  });

  it('should generate time options', () => {
    expect(component.timeOptions.length).toBeGreaterThan(0);
  });

  it('should open modal when edit is clicked', () => {
    const mockAppeal = component.pendingAppeals[0];
    component.openEditModal(mockAppeal);
    expect(component.showModal).toBe(true);
    expect(component.selectedAppeal).not.toBeNull();
  });

  it('should close modal', () => {
    component.showModal = true;
    component.closeModal();
    expect(component.showModal).toBe(false);
    expect(component.selectedAppeal).toBeNull();
  });

  it('should select a day', () => {
    const mockAppeal = component.pendingAppeals[0];
    component.openEditModal(mockAppeal);
    component.selectDay('Wed');
    expect(component.selectedAppeal?.preferredDay).toBe('Wed');
  });

  it('should have original schedule data', () => {
    const mockAppeal = component.pendingAppeals[0];
    expect(mockAppeal.originalDay).toBeDefined();
    expect(mockAppeal.originalStartTime).toBeDefined();
    expect(mockAppeal.originalEndTime).toBeDefined();
    expect(mockAppeal.originalRoom).toBeDefined();
  });
});