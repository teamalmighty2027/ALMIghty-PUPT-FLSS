import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogViewInternalArrangementsComponent } from './dialog-view-internal-arrangements.component';

describe('DialogViewInternalArrangementsComponent', () => {
  let component: DialogViewInternalArrangementsComponent;
  let fixture: ComponentFixture<DialogViewInternalArrangementsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogViewInternalArrangementsComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(
      DialogViewInternalArrangementsComponent
    );
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
