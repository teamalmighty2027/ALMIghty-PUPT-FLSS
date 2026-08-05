import { NgControl } from '@angular/forms';
import { TwoDigitInputDirective } from './two-digit-input.directive';

describe('TwoDigitInputDirective', () => {
  it('should create an instance', () => {
    const mockNgControl = {
      control: jasmine.createSpyObj('AbstractControl', ['setValue'])
    } as unknown as NgControl;
    const directive = new TwoDigitInputDirective(mockNgControl);
    expect(directive).toBeTruthy();
  });
});
