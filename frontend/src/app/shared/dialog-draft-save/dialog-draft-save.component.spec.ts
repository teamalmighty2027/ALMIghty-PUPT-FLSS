import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogDraftSaveComponent } from './dialog-draft-save.component';

describe('DialogDraftSaveComponent', () => {
  let component: DialogDraftSaveComponent;
  let fixture: ComponentFixture<DialogDraftSaveComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogDraftSaveComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogDraftSaveComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
