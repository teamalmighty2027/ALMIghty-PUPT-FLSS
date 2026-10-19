import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';

import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { TableDialogComponent, DialogConfig } from '../../../../shared/table-dialog/table-dialog.component';
import { DialogGenericComponent } from '../../../../shared/dialog-generic/dialog-generic.component';
import { TableGenericComponent } from '../../../../shared/table-generic/table-generic.component';
import { InputField, TableHeaderComponent } from '../../../../shared/table-header/table-header.component';
import { LoadingComponent } from '../../../../shared/loading/loading.component';

import { AdminService, AcademicRank } from '../../../../core/services/superadmin/management/admin/admin.service';
import { fadeAnimation } from '../../../../core/animations/animations';

@Component({
  selector: 'app-academic-ranks',
  standalone: true,
  imports: [
    CommonModule,
    TableGenericComponent,
    TableHeaderComponent,
    LoadingComponent,
  ],
  templateUrl: './academic-ranks.component.html',
  styleUrls: ['./academic-ranks.component.scss'],
  animations: [fadeAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcademicRanksComponent implements OnInit, OnDestroy {
  ranks: AcademicRank[] = [];
  filteredRanks: any[] = [];
  isLoading = true;

  private destroy$ = new Subject<void>();

  columns = [
    { key: 'index', label: '#' },
    { key: 'name', label: 'Rank Name' },
    { key: 'status', label: 'Status' },
  ];

  displayedColumns: string[] = ['index', 'name', 'status', 'action'];

  headerInputFields: InputField[] = [
    { type: 'text', label: 'Search Ranks', key: 'search' },
  ];

  constructor(
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private adminService: AdminService
  ) {}

  ngOnInit() {
    this.fetchRanks();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  fetchRanks() {
    this.isLoading = true;
    this.adminService.getAcademicRanks()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: AcademicRank[]) => {
          this.ranks = data;
          this.mapForTable();
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.snackBar.open('Error fetching Academic Ranks.', 'Close', { duration: 3000 });
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  mapForTable() {
    this.filteredRanks = this.ranks.map(r => ({
      ...r,
      status: r.is_active ? 'Active' : 'Inactive'
    }));
  }

  onSearch(searchTerm: string) {
    const lower = searchTerm?.toLowerCase() || '';
    if (!lower) {
      this.mapForTable();
    } else {
      this.filteredRanks = this.ranks
        .filter(r => r.name.toLowerCase().includes(lower))
        .map(r => ({
          ...r,
          statusDisplay: r.is_active ? 'Active' : 'Inactive'
        }));
    }
    this.cdr.markForCheck();
  }

  onInputChange(values: { [key: string]: any }) {
    if (values['search'] !== undefined) {
      this.onSearch(values['search']);
    }
  }

  openAddDialog() {
    const config: DialogConfig = {
      title: 'Academic Rank',
      isEdit: false,
      fields: [
        { label: 'Rank Name', formControlName: 'name', type: 'text', required: true, maxLength: 255 }
      ]
    };

    const dialogRef = this.dialog.open(TableDialogComponent, { data: config, autoFocus: true, width: '400px' });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result && result.name) {
        this.adminService.addAcademicRank(result.name).subscribe({
          next: (data: any) => {
            this.snackBar.open('Rank added successfully', 'Close', { duration: 3000 });
            this.fetchRanks();
          },
          error: (err: any) => this.handleError(err)
        });
      }
    });
  }

  openEditDialog(rank: any) {
    const config: DialogConfig = {
      title: 'Academic Rank',
      isEdit: true,
      fields: [
        { label: 'Rank Name', formControlName: 'name', type: 'text', required: true, maxLength: 255 },
        { label: 'Status', formControlName: 'is_active', type: 'select', options: ['Active', 'Inactive'], required: true }
      ],
      initialValue: {
        name: rank.name,
        is_active: rank.is_active ? 'Active' : 'Inactive'
      }
    };

    const dialogRef = this.dialog.open(TableDialogComponent, { data: config, autoFocus: true, width: '400px' });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        const isActiveBool = result.is_active === 'Active';
        this.adminService.updateAcademicRank(rank.id, result.name, isActiveBool).subscribe({
          next: (data: any) => {
            this.snackBar.open('Rank updated successfully', 'Close', { duration: 3000 });
            this.fetchRanks();
          },
          error: (err: any) => this.handleError(err)
        });
      }
    });
  }

  deleteRank(id: number) {
    const dialogRef = this.dialog.open(DialogGenericComponent, {
      data: {
        title: 'Delete Rank',
        content: 'Are you sure you want to delete this academic rank? This action cannot be undone.',
        actionText: 'Delete',
        cancelText: 'Cancel',
        action: 'Delete'
      },
      panelClass: 'dialog-base'
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result === 'Delete') {
        this.adminService.deleteAcademicRank(id).subscribe({
          next: (data: any) => {
            this.snackBar.open('Rank deleted successfully', 'Close', { duration: 3000 });
            this.fetchRanks();
          },
          error: (err: any) => this.handleError(err)
        });
      }
    });
  }

  private handleError(err: any) {
    const msg = err?.error?.message || 'An error occurred. Please try again.';
    this.snackBar.open(msg, 'Close', { duration: 4000 });
  }
}