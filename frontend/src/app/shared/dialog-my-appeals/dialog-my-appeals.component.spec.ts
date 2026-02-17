import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogMyAppealsComponent } from './dialog-my-appeals.component';

describe('DialogMyAppealsComponent', () => {
  let component: DialogMyAppealsComponent;
  let fixture: ComponentFixture<DialogMyAppealsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogMyAppealsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogMyAppealsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
