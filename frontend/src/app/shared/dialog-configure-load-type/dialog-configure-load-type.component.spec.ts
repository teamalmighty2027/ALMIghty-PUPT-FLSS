import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogConfigureLoadTypeComponent } from './dialog-configure-load-type.component';

describe('DialogConfigureLoadTypeComponent', () => {
  let component: DialogConfigureLoadTypeComponent;
  let fixture: ComponentFixture<DialogConfigureLoadTypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogConfigureLoadTypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogConfigureLoadTypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
