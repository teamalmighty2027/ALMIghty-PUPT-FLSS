import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';

import { TableGenericComponent } from '../../../../../shared/table-generic/table-generic.component';
import { LoadingComponent } from '../../../../../shared/loading/loading.component';
import { SystemNotice, SystemNoticeService } from '../../../../services/superadmin/system-notice/system-notice.service';
import { fadeAnimation } from '../../../../animations/animations';
import { DialogSystemNoticeDetailsComponent } from './dialog-system-notice-details/dialog-system-notice-details.component';

@Component({
  selector: 'app-system-notices',
  standalone: true,
  imports: [
    CommonModule,
    TableGenericComponent,
    LoadingComponent,
    MatDialogModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTooltipModule,
    FormsModule,
  ],
  templateUrl: './system-notices.component.html',
  styleUrls: ['./system-notices.component.scss'],
  animations: [fadeAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemNoticesComponent implements OnInit, OnDestroy {
  isLoading = true;
  private destroy$ = new Subject<void>();
  private noticesSubject = new BehaviorSubject<SystemNotice[]>([]);
  notices$ = this.noticesSubject.asObservable();

  @ViewChild('severityBadgeTemplate', { static: true }) severityBadgeTemplate!: TemplateRef<any>;
  @ViewChild('statusTemplate', { static: true }) statusTemplate!: TemplateRef<any>;

  columns: any[] = [];
  displayedColumns: string[] = ['id', 'created_at', 'severity', 'type', 'title', 'source', 'status'];

  // Pagination & Filter State
  totalNotices = 0;
  pageSize = 10;
  currentPage = 1;

  // Filter values
  selectedSeverity: string = '';
  selectedType: string = '';
  selectedResolved: string = 'false'; // Default to Open/Unresolved

  constructor(
    private cdr: ChangeDetectorRef,
    private noticeService: SystemNoticeService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.columns = [
      { key: 'id', label: '#' },
      { key: 'created_at', label: 'Date & Time' },
      { key: 'severity', label: 'Severity', template: this.severityBadgeTemplate },
      { key: 'type', label: 'Type' },
      { key: 'title', label: 'Title' },
      { key: 'source', label: 'Source' },
      { key: 'status', label: 'Status', template: this.statusTemplate },
    ];
    this.fetchNotices();
  }

  /**
   * Fetches paginated system notices with active filters.
   */
  fetchNotices() {
    this.isLoading = true;
    
    const filters: any = {};
    if (this.selectedSeverity) {
      filters.severity = this.selectedSeverity;
    }
    if (this.selectedType) {
      filters.type = this.selectedType;
    }
    if (this.selectedResolved !== '') {
      filters.resolved = this.selectedResolved === 'true';
    }

    this.noticeService.getNotices(this.currentPage, this.pageSize, filters)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response) => {
          this.noticesSubject.next(response.data);
          this.totalNotices = response.total;
        },
        error: (err) => console.error('Failed to load system notices:', err)
      });
  }

  /**
   * Triggered when filter options change.
   */
  onFilterChange() {
    this.currentPage = 1;
    this.fetchNotices();
  }

  /**
   * Triggered when table page changes.
   */
  onPageChange(event: any) {
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.fetchNotices();
  }

  /**
   * Opens the notice details dialog.
   */
  onViewDetails(notice: SystemNotice) {
    const dialogRef = this.dialog.open(DialogSystemNoticeDetailsComponent, {
      width: '850px',
      data: notice,
      panelClass: 'custom-system-notice-panel',
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((didResolve) => {
      if (didResolve) {
        this.fetchNotices();
      }
    });
  }

  /**
   * Formats Laravel date string to human-readable date.
   */
  formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
