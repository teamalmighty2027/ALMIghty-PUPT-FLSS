import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  DialogUnsavedPreferencesComponent,
  UnsavedPreferencesAction,
} from '../../shared/dialog-unsaved-preferences/dialog-unsaved-preferences.component';

/**
 * Any component that wants this guard to check for unsaved state
 * must implement this interface.
 */
export interface HasUnsavedPreferences {
  hasUnsavedPreferences(): boolean;
  saveDraft(): void;
  discardDraft(): void;
}

export const unsavedPreferencesGuard: CanDeactivateFn<HasUnsavedPreferences> = (
  component
): Observable<boolean> => {
  // No unsaved draft — allow navigation immediately
  if (!component.hasUnsavedPreferences()) {
    return of(true);
  }

  const dialog = inject(MatDialog);
  const snackBar = inject(MatSnackBar);

  const dialogRef = dialog.open(DialogUnsavedPreferencesComponent, {
    width: '440px',
    maxWidth: '95vw',
    disableClose: true,
    autoFocus: false,
    panelClass: 'dialog-base',
  });

  return dialogRef.afterClosed().pipe(
    map((action: UnsavedPreferencesAction) => {
      if (action === 'save-draft') {
        component.saveDraft();
        snackBar.open(
          'Draft saved. Your preferences will be restored next time.',
          'OK',
          { duration: 4000, horizontalPosition: 'center', verticalPosition: 'bottom' }
        );
        return true;
      }
      if (action === 'leave') {
        // Explicitly wipe the auto-saved draft so it doesn't restore on next visit
        component.discardDraft();
        return true;
      }
      // 'stay' → block navigation
      return false;
    })
  );
};
