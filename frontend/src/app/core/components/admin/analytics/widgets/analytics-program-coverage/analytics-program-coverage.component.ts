import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService } from '../../../../../services/admin/analytics/analytics.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-analytics-program-coverage',
  standalone: true,
  imports: [
    CommonModule, 
    BaseChartDirective, 
    MatProgressSpinnerModule,
    MatIconModule
  ],
  templateUrl: './analytics-program-coverage.component.html',
  styleUrl: './analytics-program-coverage.component.scss',
})
export class AnalyticsProgramCoverageComponent implements OnInit, OnDestroy {
  isLoading = true;
  isEmpty = false;
  private destroy$ = new Subject<void>();

  // Bar Chart Configuration for Program Coverage
  public barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y', // Horizontal bars
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: (context) => ` ${context.raw}% Coverage`
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 100,
        grid: { display: false },
        ticks: {
          callback: (value) => `${value}%`,
          font: { family: "'Inter', sans-serif", size: 10 }
        }
      },
      y: {
        grid: { display: false },
        ticks: {
          font: { family: "'Inter', sans-serif", weight: 'bold' }
        }
      }
    }
  };

  public barChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      {
        data: [],
        backgroundColor: '#007BFF', 
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
        barPercentage: 0.6, // Create gaps between bars
        categoryPercentage: 0.8
      }
    ]
  };

  public barChartType: ChartType = 'bar';

  constructor(private analyticsService: AnalyticsService) {}

  /**
   * Initializes the component and subscribes to term changes
   */
  ngOnInit(): void {
    this.analyticsService.selectedTerm$
      .pipe(takeUntil(this.destroy$))
      .subscribe((termId) => {
        if (termId) {
          this.fetchProgramCoverage(termId);
        }
      });
  }

  /**
   * Cleanup subscriptions on component destruction
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Fetches aggregated program coverage data from the service
   * @param termId The active semester ID to fetch data for
   */
  private fetchProgramCoverage(termId: number): void {
    this.isLoading = true;
    this.isEmpty = false;
    
    this.analyticsService.getProgramCoverage(termId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any[]) => {
          if (!data || data.length === 0) {
            this.isEmpty = true;
            this.isLoading = false;
            return;
          }
          this.processCoverageData(data);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error fetching program coverage:', error);
          this.isLoading = false;
          this.isEmpty = true;
        }
      });
  }

  /**
   * Calculates percentages and prepares chart data with status colors
   * @param data Array of raw program coverage statistics
   */
  private processCoverageData(data: any[]): void {
    const labels = data.map(item => item.program_code);
    const percentages = data.map(item => {
      const total = Number(item.total_courses) || 0;
      const scheduled = Number(item.scheduled_courses) || 0;
      
      if (total === 0) return 0;
      return Math.round((scheduled / total) * 100);
    });

    this.barChartData = {
      labels: labels,
      datasets: [{
        ...this.barChartData.datasets[0],
        data: percentages,
        backgroundColor: percentages.map(p => {
          if (p >= 100) return '#4CAF50'; // Success Green
          if (p >= 50) return '#2196F3';  // Primary Blue
          return '#FF9800';               // Warning Orange
        }),
        borderColor: percentages.map(p => {
          if (p >= 100) return '#388E3C';
          if (p >= 50) return '#1976D2';
          return '#F57C00';
        })
      }]
    };
  }
}
