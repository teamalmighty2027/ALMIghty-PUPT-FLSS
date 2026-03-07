import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';

import { TableGenericComponent } from '../../../../../shared/table-generic/table-generic.component';
import { TableHeaderComponent, InputField } from '../../../../../shared/table-header/table-header.component';
import { LoadingComponent } from '../../../../../shared/loading/loading.component';

import { AuditEntry, AuditLogService } from '../../../../services/superadmin/audit-log/audit-log.service';
import { fadeAnimation } from '../../../../animations/animations';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [
    CommonModule,
    TableGenericComponent,
    TableHeaderComponent,
    LoadingComponent,
  ],
  templateUrl: './audit-log.component.html',
  styleUrls: ['./audit-log.component.scss'],
  animations: [fadeAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogComponent implements OnInit, OnDestroy {
  isLoading = true;
  private destroy$ = new Subject<void>();
  private allLogs: AuditEntry[] = [];
  private logsSubject = new BehaviorSubject<AuditEntry[]>([]);
  logs$ = this.logsSubject.asObservable();

  columns = [
    { key: 'id', label: '#' },
    { key: 'date_time', label: 'Date & Time' },
    { key: 'faculty_name', label: 'Faculty Name' },
    { key: 'action_type', label: 'Action Type' },
    { key: 'component', label: 'Component' },
    { key: 'changes_summary', label: 'Changes Summary' },
  ];

  displayedColumns: string[] = ['id', 'date_time', 'faculty_name', 'action_type', 'component', 'changes_summary'];

  headerInputFields: InputField[] = [
    { type: 'text', label: 'Search Faculty', key: 'search' },
  ];

  constructor(
    private cdr: ChangeDetectorRef,
    private auditService: AuditLogService
  ) {}

  ngOnInit() {
    this.fetchLogs();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
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
      .subscribe((logs: AuditEntry[]) => {
        this.allLogs = logs;
        this.logsSubject.next(this.allLogs);
      });
  }

  onInputChange(values: { [key: string]: any }) {
    if (values['search'] !== undefined) {
      const term = values['search'].trim().toLowerCase();
      const filtered = this.allLogs.filter((log: AuditEntry) => 
        log.faculty_name.toLowerCase().includes(term) ||
        log.changes_summary.toLowerCase().includes(term)
      );
      this.logsSubject.next(filtered);
    }
  }
}