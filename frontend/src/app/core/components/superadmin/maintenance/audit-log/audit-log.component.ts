import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';

import { TableGenericComponent } from '../../../../../shared/table-generic/table-generic.component';
import { LoadingComponent } from '../../../../../shared/loading/loading.component';
import { AuditEntry, AuditLogService } from '../../../../services/superadmin/audit-log/audit-log.service';
import { fadeAnimation } from '../../../../animations/animations';
import { AuditLogDetailsComponent } from './audit-log-details/audit-log-details.component';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, TableGenericComponent, LoadingComponent],
  templateUrl: './audit-log.component.html',
  styleUrls: ['./audit-log.component.scss'],
  animations: [fadeAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogComponent implements OnInit, OnDestroy {
  isLoading = true;
  private destroy$ = new Subject<void>();
  private logsSubject = new BehaviorSubject<AuditEntry[]>([]);
  logs$ = this.logsSubject.asObservable();

  @ViewChild('actionBadgeTemplate', { static: true }) actionBadgeTemplate!: TemplateRef<any>;

  columns: any[] = [];
  displayedColumns: string[] = ['id', 'date_time', 'role', 'user', 'action_type', 'changes_summary'];

  constructor(
    private cdr: ChangeDetectorRef,
    private auditService: AuditLogService,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.columns = [
      { key: 'id', label: '#' },
      { key: 'date_time', label: 'Date & Time' },
      { key: 'role', label: 'Role' },
      { key: 'user', label: 'User' },
      { key: 'action_type', label: 'Action Type', template: this.actionBadgeTemplate },
      { key: 'changes_summary', label: 'Changes Summary' },
    ];
    this.fetchLogs();
  }

  fetchLogs() {
    this.isLoading = true;
    this.auditService.getAuditLogs()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (logs) => this.logsSubject.next(logs),
        error: (err) => console.error('Failed to load audit logs:', err)
      });
  }

  onViewDetails(log: AuditEntry) {
    this.dialog.open(AuditLogDetailsComponent, { width: '800px', data: log });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}