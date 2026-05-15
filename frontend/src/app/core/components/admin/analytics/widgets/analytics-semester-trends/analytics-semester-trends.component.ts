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
  selector: 'app-analytics-semester-trends',
  standalone: true,
  imports: [
    CommonModule, 
    BaseChartDirective, 
    MatProgressSpinnerModule,
    MatIconModule,
    AnalyticsInsightComponent
  ],
  templateUrl: './analytics-semester-trends.component.html',
  styleUrl: './analytics-semester-trends.component.scss'
})
export class AnalyticsSemesterTrendsComponent implements OnInit, OnDestroy {
  isLoading = true;
  isEmpty = false;
  public insightText = '';
  public insightType: 'info' | 'success' | 'warning' | 'alert' = 'info';
  private destroy$ = new Subject<void>();

  public lineChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { font: { family: "'Inter', sans-serif", size: 12 } }
      },
      tooltip: {
        callbacks: {
          label: (context: any) => ` ${context.dataset.label}: ${context.raw}%`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Progress Percentage (%)',
          font: { family: "'Inter', sans-serif", size: 11 }
        }
      },
      x: {
        grid: { display: false }
      }
    }
  };

  public lineChartData: ChartData<'line'> = {
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Scheduling Progress',
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 5,
        pointHoverRadius: 7
      }
    ]
  };

  public lineChartType: ChartType = 'line';

  constructor(private analyticsService: AnalyticsService) {}

  // Initializes the component and fetches cross-term trends
  ngOnInit(): void {
    this.fetchTrends();
  }

  // Cleanup subscriptions on component destruction
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Fetches scheduling progress trends across the last 5 semesters */
  private fetchTrends(): void {
    this.isLoading = true;
    this.isEmpty = false;
    
    this.analyticsService.getSemesterTrends()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any[]) => {
          if (!data || data.length === 0) {
            this.isEmpty = true;
            this.isLoading = false;
            return;
          }
          this.processTrends(data);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error fetching semester trends:', error);
          this.isLoading = false;
          this.isEmpty = true;
        }
      });
  }

  /** Processes trend data into chart-friendly format */
  private processTrends(data: any[]): void {
    this.lineChartData = {
      labels: data.map(d => d.semester_label),
      datasets: [
        {
          ...this.lineChartData.datasets[0],
          data: data.map(d => d.scheduling_progress)
        }
      ]
    };
    this.generateInsight(data);
  }

  /** Generates a plain-text insight based on trend data */
  private generateInsight(data: any[]): void {
    if (data.length < 2) {
      this.insightText = 'Historical trend analysis requires at least two terms of data.';
      this.insightType = 'info';
      return;
    }

    const latest = data[data.length - 1];
    const previous = data[data.length - 2];
    const diff = latest.scheduling_progress - previous.scheduling_progress;

    if (diff > 0) {
      this.insightText = `Scheduling progress improved by ${diff.toFixed(1)}% compared to the previous term.`;
      this.insightType = 'success';
    } else if (diff < 0) {
      this.insightText = `Scheduling progress dropped by ${Math.abs(diff).toFixed(1)}% compared to the previous term.`;
      this.insightType = 'warning';
    } else {
      this.insightText = 'Scheduling progress remained consistent with the previous term.';
      this.insightType = 'info';
    }
  }
}
