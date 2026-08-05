import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { RoomTypesComponent } from './room-types.component';

describe('RoomTypesComponent', () => {
  let component: RoomTypesComponent;
  let fixture: ComponentFixture<RoomTypesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        RoomTypesComponent,
        HttpClientTestingModule,
        NoopAnimationsModule
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoomTypesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
