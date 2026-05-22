import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService } from '../../../../../services/admin/analytics/analytics.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';

import { 
  AnalyticsInsightComponent 
} from '../analytics-insight/analytics-insight.component';

@Component({
  selector: 'app-analytics-appeal-activity',
  standalone: true,
  imports: [
    CommonModule, 
    BaseChartDirective, 
    MatProgressSpinnerModule,
    MatIconModule,
    AnalyticsInsightComponent
  ],
  templateUrl: './analytics-appeal-activity.component.html',
  styleUrl: './analytics-appeal-activity.component.scss'
})
export class AnalyticsAppealActivityComponent implements OnInit, OnDestroy {
  isLoading = true;
  isEmpty = false;
  public insightText = '';
  public insightType: 'info' | 'success' | 'warning' | 'alert' = 'info';
  private destroy$ = new Subject<void>();

  public doughnutChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: { font: { family: "'Inter', sans-serif", size: 11 } }
      },
      tooltip: {
        callbacks: {
          label: (context: any) => ` ${context.label}: ${context.raw} appeals`
        }
      }
    },
    cutout: '70%'
  };

  public doughnutChartData: ChartData<'doughnut'> = {
    labels: ['Approved', 'Denied', 'Pending'],
    datasets: [
      {
        data: [0, 0, 0],
        backgroundColor: [
          '#4CAF50', // Green
          '#F44336', // Red
          '#2196F3'  // Blue
        ],
        hoverOffset: 4
      }
    ]
  };

  public doughnutChartType: 'doughnut' = 'doughnut';
  public totalAppeals = 0;

  constructor(private analyticsService: AnalyticsService) {}

  // Initializes the component and subscribes to term changes
  ngOnInit(): void {
    this.analyticsService.selectedTerm$
      .pipe(takeUntil(this.destroy$))
      .subscribe((termId) => {
        if (termId) {
          this.fetchAppealActivity(termId);
        }
      });
  }

  // Cleanup subscriptions on component destruction
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Fetches appeal activity distribution (approved, denied, pending) */
  private fetchAppealActivity(termId: number): void {
    this.isLoading = true;
    this.isEmpty = false;
    
    this.analyticsService.getAppealActivity(termId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          if (!data || data.total === 0) {
            this.isEmpty = true;
            this.isLoading = false;
            this.totalAppeals = 0;
            return;
          }
          this.processAppeals(data);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error fetching appeal activity:', error);
          this.isLoading = false;
          this.isEmpty = true;
        }
      });
  }

  /** Processes appeal data into chart-friendly format */
  private processAppeals(data: any): void {
    this.totalAppeals = data.total;
    this.doughnutChartData = {
      ...this.doughnutChartData,
      datasets: [{
        ...this.doughnutChartData.datasets[0],
        data: [
          Number(data.approved) || 0,
          Number(data.denied) || 0,
          Number(data.pending) || 0
        ]
      }]
    };
    this.generateInsight(data);
  }

  /** Generates a plain-text insight based on appeal data */
  private generateInsight(data: any): void {
    const total = Number(data.total) || 0;
    const approved = Number(data.approved) || 0;
    const pending = Number(data.pending) || 0;
    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

    this.insightText = `${total} appeals filed this term. Approval rate: ${approvalRate}%. ${pending} appeals are still pending.`;
    
    if (pending > 5) {
      this.insightType = 'warning';
    } else if (approvalRate < 30 && total > 5) {
      this.insightType = 'alert';
    } else if (approvalRate > 70 && total > 5) {
      this.insightType = 'success';
    } else {
      this.insightType = 'info';
    }
  }
}
