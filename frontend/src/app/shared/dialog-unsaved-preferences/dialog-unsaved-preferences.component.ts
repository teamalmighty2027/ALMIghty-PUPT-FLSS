import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';

export type UnsavedPreferencesAction = 'leave' | 'stay' | 'save-draft';

@Component({
  selector: 'app-dialog-unsaved-preferences',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatSymbolDirective],
  templateUrl: './dialog-unsaved-preferences.component.html',
  styleUrl: './dialog-unsaved-preferences.component.scss',
})
export class DialogUnsavedPreferencesComponent {
  constructor(
    private dialogRef: MatDialogRef<DialogUnsavedPreferencesComponent>
  ) {}

  stay(): void {
    this.dialogRef.close('stay' as UnsavedPreferencesAction);
  }

  saveDraft(): void {
    this.dialogRef.close('save-draft' as UnsavedPreferencesAction);
  }

  leave(): void {
    this.dialogRef.close('leave' as UnsavedPreferencesAction);
  }
}
