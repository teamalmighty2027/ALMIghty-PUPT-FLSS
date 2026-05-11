import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { AnalyticsService } from '../../../services/admin/analytics/analytics.service';
import { ReportsService } from '../../../services/admin/reports/reports.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { 
  AnalyticsHeatmapComponent 
} from './widgets/analytics-heatmap/analytics-heatmap.component';
import { 
  AnalyticsFacultyTypeComponent 
} from './widgets/analytics-faculty-type/analytics-faculty-type.component';
import { 
  AnalyticsRoomUtilizationComponent 
} from './widgets/analytics-room-utilization/analytics-room-utilization.component';
import { 
  AnalyticsFacultyLoadComponent 
} from './widgets/analytics-faculty-load/analytics-faculty-load.component';
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
    AnalyticsHeatmapComponent,
    AnalyticsFacultyTypeComponent,
    AnalyticsRoomUtilizationComponent,
    AnalyticsFacultyLoadComponent,
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

  // Initializes the dashboard by loading academic terms
  ngOnInit(): void {
    this.loadTerms();
  }

  // Cleanup subscriptions on component destruction
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Loads available semesters for the term selector
  loadTerms(): void {
    this.isTermsLoading = true;
    
    this.reportsService.getAllTermsForDropdown()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.availableTerms = data;
          
          const currentTermId = this.analyticsService.getSelectedTerm();
          const hasCurrentTerm = currentTermId !== null && data.some(
            (term) => term.active_semester_id === currentTermId,
          );

          if (hasCurrentTerm) {
            this.selectedTermId = currentTermId;
          } else {
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

  // Updates the global term state when the user selects a different term
  onTermChange(): void {
    this.analyticsService.setSelectedTerm(this.selectedTermId);
  }

  // Returns a descriptive label for a semester number
  getSemesterLabel(semesterNumber: number): string {
    switch (semesterNumber) {
      case 1: return '1st Semester';
      case 2: return '2nd Semester';
      case 3: return 'Summer';
      default: return `Sem ${semesterNumber}`;
    }
  }
}
