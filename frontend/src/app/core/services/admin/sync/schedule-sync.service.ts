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
  private activeConsumers = new Set<string>();

  /**
   * Initializes visibility and dialog listeners for auto sync.
   * @param dialog - Angular Material dialog service.
   */
  constructor(private dialog: MatDialog) {
    this.initVisibilityListener();
    this.initDialogListener();
  }

  /**
   * Registers a consumer and starts the background timer.
   * @param consumerIdOrInterval - Consumer ID (string) or interval (number).
   * @param intervalMs - Polling interval in ms (default 15000ms).
   */
  public startAutoRefresh(
    consumerIdOrInterval?: string | number,
    intervalMs = 15000
  ): void {
    let consumerId = 'default';
    let timeout = intervalMs;

    if (typeof consumerIdOrInterval === 'string') {
      consumerId = consumerIdOrInterval;
    } else if (typeof consumerIdOrInterval === 'number') {
      timeout = consumerIdOrInterval;
    }

    this.activeConsumers.add(consumerId);

    if (!this.timerSubscription) {
      this.timerSubscription = timer(timeout, timeout).subscribe(() => {
        if (!this.isPaused && !this.isDialogOpen()) {
          this.refreshTriggerSubject.next(true);
        }
      });
    }
  }

  /**
   * Unregisters a consumer and stops timer if no consumers remain.
   * @param consumerId - Optional consumer identifier.
   */
  public stopAutoRefresh(consumerId?: string): void {
    if (consumerId) {
      this.activeConsumers.delete(consumerId);
    } else {
      this.activeConsumers.clear();
    }

    if (this.activeConsumers.size === 0 && this.timerSubscription) {
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
