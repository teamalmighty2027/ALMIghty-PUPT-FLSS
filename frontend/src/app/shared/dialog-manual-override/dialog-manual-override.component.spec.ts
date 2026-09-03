import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogManualOverrideComponent } from './dialog-manual-override.component';

describe('DialogManualOverrideComponent', () => {
  let component: DialogManualOverrideComponent;
  let fixture: ComponentFixture<DialogManualOverrideComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogManualOverrideComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DialogManualOverrideComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
