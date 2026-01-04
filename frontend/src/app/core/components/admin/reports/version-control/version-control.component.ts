import { Component, OnInit, ViewChild, AfterViewInit, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { TableHeaderComponent, InputField } from '../../../../../shared/table-header/table-header.component';
import { LoadingComponent } from '../../../../../shared/loading/loading.component';
import { ConfirmDialogComponent } from '../../../../../shared/dialog-confirm-vc/dialog-confirm-vc.component';

import { ReportsService } from '../../../../services/admin/reports/reports.service';

import { fadeAnimation } from '../../../../animations/animations';

interface VersionControl {
  id: number;
  dateTime: Date;
  facultyName: string;
  actionType: 'UPDATED' | 'ADDED' | 'DELETED';
  component: string;
  changesSummary: string;
}

@Component({
  selector: 'app-version-control',
  imports: [
    CommonModule,
    TableHeaderComponent,
    LoadingComponent,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    FormsModule,
    MatDialogModule,
  ],
  templateUrl: './version-control.component.html',
  styleUrls: ['./version-control.component.scss'],
  animations: [fadeAnimation],
})
export class VersionControlComponent implements OnInit, AfterViewInit, AfterViewChecked {
  inputFields: InputField[] = [
    {
      type: 'text',
      label: 'Search Faculty',
      key: 'search',
    },
    {
      type: 'date',
      label: 'Date Range',
      key: 'dateRange',
    },
  ];

  displayedColumns: string[] = [
    'index',
    'dateTime',
    'facultyName',
    'actionType',
    'component',
    'changesSummary',
    'actions',
  ];

  dataSource = new MatTableDataSource<VersionControl>();
  filteredData: VersionControl[] = [];
  isLoading = true;

  private searchInput$ = new Subject<string>();
  private dateRangeFilter: { start?: Date; end?: Date } = {};

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor(
    public dialog: MatDialog,
    private reportsService: ReportsService // ADD THIS
  ) {}

  ngOnInit(): void {
    this.fetchVersionControlData();
    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((searchQuery) => {
        this.performSearch(searchQuery);
      });
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
  }

  ngAfterViewChecked() {
    if (this.dataSource.paginator !== this.paginator) {
      this.dataSource.paginator = this.paginator;
    }
  }

  fetchVersionControlData(search: string = '', startDate: string = '', endDate: string = ''): void {
    this.isLoading = true;

    this.reportsService.getVersionControlReport(search, startDate, endDate).subscribe({
      next: (response: any) => {
        // Map the response to ensure dateTime is a JS Date object
        const realData = response.version_control_report.records.map((item: any) => ({
          ...item,
          dateTime: new Date(item.dateTime) 
        }));

        this.dataSource.data = realData;
        this.isLoading = false;
        
        // Re-attach paginator
        if (this.paginator) {
          this.dataSource.paginator = this.paginator;
        }
      },
      error: (error) => {
        console.error('Error fetching version control data:', error);
        this.isLoading = false;
        this.dataSource.data = []; // Clear table on error
      }
    });
  }

  getRowIndex(index: number): number {
    if (this.paginator) {
      return index + 1 + this.paginator.pageIndex * this.paginator.pageSize;
    }
    return index + 1;
  }

  onInputChange(changes: { [key: string]: any }) {
    if (changes['search'] !== undefined) {
      const searchQuery = changes['search'].trim().toLowerCase();
      this.searchInput$.next(searchQuery);
    }

    if (changes['dateRange'] !== undefined) {
      this.dateRangeFilter = changes['dateRange'];
      this.applyFilters();
    }
  }

  performSearch(searchQuery: string) {
    this.applyFilters(searchQuery);
  }

  applyFilters(searchQuery?: string) {
    let filtered = [...this.filteredData];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter((item) =>
        item.facultyName.toLowerCase().includes(searchQuery)
      );
    }

    // Apply date range filter
    if (this.dateRangeFilter.start || this.dateRangeFilter.end) {
      filtered = filtered.filter((item) => {
        const itemDate = new Date(item.dateTime);
        if (this.dateRangeFilter.start && itemDate < this.dateRangeFilter.start) {
          return false;
        }
        if (this.dateRangeFilter.end && itemDate > this.dateRangeFilter.end) {
          return false;
        }
        return true;
      });
    }

    this.dataSource.data = filtered;
  }

  confirmRestore(element: VersionControl): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Confirm Restore',
        message: `Are you sure you want to restore this ${element.actionType.toLowerCase()} action?`,
        details: `Component: ${element.component}\nChanges: ${element.changesSummary}`,
        confirmText: 'Restore',
        cancelText: 'Cancel',
        confirmColor: 'primary',
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.onRestore(element);
      }
    });
  }

  confirmDelete(element: VersionControl): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Confirm Delete',
        message: `Are you sure you want to delete this addition?`,
        details: `Component: ${element.component}\nChanges: ${element.changesSummary}`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmColor: 'warn',
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.onDelete(element);
      }
    });
  }

  onRestore(element: VersionControl): void {
    this.isLoading = true;
    this.reportsService.restoreVersionControl(element.id).subscribe({
      next: (response) => {
        console.log('Restore successful:', response);
        // Refresh the table to see the new "RESTORED" log
        this.fetchVersionControlData(); 
        // Optional: Add a toast/snackbar here for user feedback
      },
      error: (error) => {
        console.error('Restore failed:', error);
        this.isLoading = false;
      }
    });
  }

  onDelete(element: VersionControl): void {
    this.isLoading = true;
    this.reportsService.revertAddVersionControl(element.id).subscribe({
      next: (response) => {
        console.log('Delete successful:', response);
        // Refresh the table
        this.fetchVersionControlData();
      },
      error: (error) => {
        console.error('Delete failed:', error);
        this.isLoading = false;
      }
    });
  }

  formatDateTime(date: Date): string {
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    };
    return new Date(date).toLocaleString('en-US', options);
  }

  getActionClass(actionType: string): string {
    return `action-${actionType.toLowerCase()}`;
  }
}