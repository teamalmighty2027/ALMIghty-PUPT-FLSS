import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DraftEntry } from '../../core/models/scheduling.model';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';

/**
 * Result of a single draft save operation.
 */
export interface DraftSaveResult {
  schedule_id: number;
  status: 'saving' | 'success' | 'error' | 'skipped';
  errorMessage?: string;
}

/**
 * Input data for the Draft Save dialog.
 */
export interface DialogDraftSaveData {
  dirtyEntries: DraftEntry[];
  skippedEntries: DraftEntry[];
  saveStream$: Observable<DraftSaveResult>;
}

@Component({
  selector: 'app-dialog-draft-save',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatProgressBarModule,
    MatIconModule,
    MatButtonModule,
    MatSymbolDirective
  ],
  templateUrl: './dialog-draft-save.component.html',
  styleUrl: './dialog-draft-save.component.scss'
})
export class DialogDraftSaveComponent implements OnInit, OnDestroy {
  results = new Map<number, DraftSaveResult>();
  isComplete = false;
  private destroy$ = new Subject<void>();

  constructor(
    public dialogRef: MatDialogRef<DialogDraftSaveComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogDraftSaveData
  ) {
    // Prevent closing until explicitly finished
    this.dialogRef.disableClose = true;
  }

  /**
   * Initializes the progress tracking map and subscribes to the save stream.
   */
  ngOnInit(): void {
    // Initialize results map with initial statuses
    this.data.dirtyEntries.forEach(entry => {
      this.results.set(entry.schedule_id, {
        schedule_id: entry.schedule_id,
        status: 'saving'
      });
    });

    this.data.skippedEntries.forEach(entry => {
      this.results.set(entry.schedule_id, {
        schedule_id: entry.schedule_id,
        status: 'skipped'
      });
    });

    // Handle stream of results from parent component
    this.data.saveStream$.pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (result) => {
        this.results.set(result.schedule_id, result);
      },
      complete: () => {
        this.isComplete = true;
      },
      error: () => {
        this.isComplete = true;
      }
    });
  }

  /**
   * Clean up subscriptions.
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Total number of entries attempted to save.
   */
  get totalItems(): number {
    return this.data.dirtyEntries.length;
  }

  /**
   * Number of items that have reached a terminal state (success or error).
   */
  get completedCount(): number {
    return Array.from(this.results.values()).filter(r => 
      r.status === 'success' || r.status === 'error'
    ).length;
  }

  /**
   * Progress percentage for the progress bar.
   */
  get progressValue(): number {
    if (this.totalItems === 0) return 100;
    return (this.completedCount / this.totalItems) * 100;
  }

  get successCount(): number {
    return Array.from(this.results.values()).filter(r => r.status === 'success').length;
  }

  get errorCount(): number {
    return Array.from(this.results.values()).filter(r => r.status === 'error').length;
  }

  get skippedCount(): number {
    return this.data.skippedEntries.length;
  }

  /**
   * Helper for template to get status of a specific entry.
   */
  getResult(schedule_id: number): DraftSaveResult | undefined {
    return this.results.get(schedule_id);
  }

  /**
   * Closes the dialog. Emits true to indicate a refresh might be needed.
   */
  onDone(): void {
    this.dialogRef.close(true);
  }
}
