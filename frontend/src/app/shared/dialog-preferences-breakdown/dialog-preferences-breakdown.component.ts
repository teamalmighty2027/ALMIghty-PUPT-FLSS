import { Component, Inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';
import { LoadingComponent } from '../loading/loading.component';
import {
  OverviewService,
  PreferencesBreakdownResponse,
  ProgramBreakdown,
  GeneralEducationBreakdown,
} from '../../core/services/admin/overview/overview.service';

export interface DialogPreferencesBreakdownData {
  academicYear?: string;
  semester?: string;
  activeSemesterId?: number | null;
}

@Component({
  selector: 'app-dialog-preferences-breakdown',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSymbolDirective,
    LoadingComponent,
  ],
  templateUrl: './dialog-preferences-breakdown.component.html',
  styleUrls: ['./dialog-preferences-breakdown.component.scss'],
})
export class DialogPreferencesBreakdownComponent implements OnInit {
  isLoading = true;
  hasError = false;
  errorMessage = '';
  breakdownData: PreferencesBreakdownResponse | null = null;
  expandedCategories = new Set<string>();

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: DialogPreferencesBreakdownData,
    private dialogRef: MatDialogRef<DialogPreferencesBreakdownComponent>,
    private overviewService: OverviewService,
    private cdr: ChangeDetectorRef
  ) {}

  /**
   * Initializes the dialog component and triggers breakdown loading.
   */
  ngOnInit(): void {
    this.loadBreakdown();
  }

  /**
   * Fetches the preferences breakdown from the backend overview service.
   */
  loadBreakdown(): void {
    this.isLoading = true;
    this.hasError = false;
    this.errorMessage = '';

    this.overviewService
      .getPreferencesBreakdown(this.data?.activeSemesterId)
      .subscribe({
        next: (response) => {
          this.breakdownData = response;
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          this.hasError = true;
          this.errorMessage =
            error?.error?.message ||
            'Failed to load preferences breakdown. Please try again.';
          this.isLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  /**
   * Toggles the expansion state of a program or GEED unassigned course list.
   * @param categoryKey Unique key for the category (e.g. 'GEED' or program id)
   */
  toggleExpand(categoryKey: string): void {
    if (this.expandedCategories.has(categoryKey)) {
      this.expandedCategories.delete(categoryKey);
    } else {
      this.expandedCategories.add(categoryKey);
    }
  }

  /**
   * Returns whether a category's unassigned courses section is expanded.
   * @param categoryKey Unique key for the category
   */
  isExpanded(categoryKey: string): boolean {
    return this.expandedCategories.has(categoryKey);
  }

  /**
   * Returns a status CSS class based on the subject coverage percentage.
   * @param percentage Coverage percentage
   */
  getCoverageClass(percentage: number): string {
    if (percentage >= 80) {
      return 'coverage-high';
    }
    if (percentage >= 50) {
      return 'coverage-medium';
    }
    return 'coverage-low';
  }

  /**
   * Closes the dialog window.
   */
  closeDialog(): void {
    this.dialogRef.close();
  }
}
