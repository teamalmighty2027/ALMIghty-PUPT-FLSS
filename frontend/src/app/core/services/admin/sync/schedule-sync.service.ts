import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Subject, Subscription, timer } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ScheduleSyncService {
  private refreshTriggerSubject = new Subject<boolean>();
  public refreshTrigger$ = this.refreshTriggerSubject.asObservable();
  public onRefresh$ = this.refreshTrigger$;

  private isPaused = false;
  private timerSubscription?: Subscription;

  /**
   * Initializes visibility and dialog listeners for auto sync.
   * @param dialog - Angular Material dialog service.
   */
  constructor(private dialog: MatDialog) {
    this.initVisibilityListener();
    this.initDialogListener();
  }

  /**
   * Starts the 15-second background timer.
   * @param intervalMs - Polling interval in milliseconds (default 15000ms).
   */
  public startAutoRefresh(intervalMs = 15000): void {
    this.stopAutoRefresh();

    this.timerSubscription = timer(intervalMs, intervalMs).subscribe(() => {
      if (!this.isPaused && !this.isDialogOpen()) {
        this.refreshTriggerSubject.next(true);
      }
    });
  }

  /**
   * Stops the background polling timer.
   */
  public stopAutoRefresh(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = undefined;
    }
  }

  /**
   * Forces an immediate manual refresh event emission.
   */
  public forceRefresh(): void {
    this.refreshTriggerSubject.next(true);
  }

  /**
   * Checks if any Angular Material dialog is currently open.
   */
  private isDialogOpen(): boolean {
    return !!(this.dialog && this.dialog.openDialogs.length > 0);
  }

  /**
   * Listens to HTML5 Page Visibility API state changes.
   */
  private initVisibilityListener(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.isPaused = document.visibilityState === 'hidden';
      });
    }
  }

  /**
   * Listens to MatDialog open and close events.
   */
  private initDialogListener(): void {
    if (this.dialog) {
      this.dialog.afterOpened.subscribe(() => {
        // Dialog state managed dynamically
      });

      this.dialog.afterAllClosed.subscribe(() => {
        // Dialog state managed dynamically
      });
    }
  }
}
