import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSymbolDirective } from '../../../imports/mat-symbol.directive';
import { AnalyticsService } from '../../../services/admin/analytics/analytics.service';
import { ReportsService } from '../../../services/admin/reports/reports.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { fadeAnimation } from '../../../animations/animations';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatIconModule,
    MatSymbolDirective,
  ],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
  animations: [fadeAnimation],
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  availableTerms: any[] = [];
  selectedTermId: number | null = null;
  isTermsLoading = true;
  
  private destroy$ = new Subject<void>();

  constructor(
    private analyticsService: AnalyticsService,
    private reportsService: ReportsService // Reuse ReportsService for terms
  ) {}

  ngOnInit(): void {
    this.loadTerms();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load available semesters for the selector
   */
  loadTerms(): void {
    this.isTermsLoading = true;
    this.reportsService.getAllTermsForDropdown()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.availableTerms = data;
          
          // Try to get persisted term from service
          const currentTermId = this.analyticsService.getSelectedTerm();
          const hasCurrentTerm = currentTermId !== null && data.some(
            (term) => term.active_semester_id === currentTermId,
          );

          if (hasCurrentTerm) {
            this.selectedTermId = currentTermId;
          } else {
            // Default to active term
            const activeTerm = data.find((term) => term.is_active === 1);
            if (activeTerm) {
              this.selectedTermId = activeTerm.active_semester_id;
              this.analyticsService.setSelectedTerm(this.selectedTermId);
            }
          }
          this.isTermsLoading = false;
        },
        error: (error) => {
          console.error('Error loading terms for analytics:', error);
          this.isTermsLoading = false;
        }
      });
  }

  /**
   * Handle term change from the dropdown
   */
  onTermChange(): void {
    this.analyticsService.setSelectedTerm(this.selectedTermId);
    // Clearing cache might be handled by service or components themselves
  }

  /**
   * Helper for semester labeling
   */
  getSemesterLabel(semesterNumber: number): string {
    switch (semesterNumber) {
      case 1: return '1st Semester';
      case 2: return '2nd Semester';
      case 3: return 'Summer';
      default: return `Sem ${semesterNumber}`;
    }
  }
}
