import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  DialogGenericComponent
} from '../../shared/dialog-generic/dialog-generic.component';

/**
 * Component interface requiring an unsaved changes detection method.
 */
export interface HasUnsavedScheduling {
  hasUnsavedChanges(): boolean;
}

// Guards against accidental navigation away from scheduling during active draft
export const schedulingUnsavedGuard: CanDeactivateFn<HasUnsavedScheduling> = (
  component: HasUnsavedScheduling,
): Observable<boolean> => {
  // Allow immediate navigation if no unsaved changes exist
  if (!component || !component.hasUnsavedChanges ||
      !component.hasUnsavedChanges()) {
    return of(true);
  }

  const dialog = inject(MatDialog);

  const dialogRef = dialog.open(DialogGenericComponent, {
    data: {
      title: 'Discard Unsaved Draft?',
      content:
        'You have unsaved changes in draft mode. ' +
        'Navigating away will discard your draft.',
      actionText: 'Discard & Leave',
      cancelText: 'Stay in Draft',
      action: 'confirm',
    },
  });

  return dialogRef.afterClosed().pipe(
    map((result) => result === 'confirm')
  );
};
