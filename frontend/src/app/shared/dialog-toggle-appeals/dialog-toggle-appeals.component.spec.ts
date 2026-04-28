import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogToggleAppealsComponent } from './dialog-toggle-appeals.component';

describe('DialogToggleAppealsComponent', () => {
  let component: DialogToggleAppealsComponent;
  let fixture: ComponentFixture<DialogToggleAppealsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogToggleAppealsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogToggleAppealsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
