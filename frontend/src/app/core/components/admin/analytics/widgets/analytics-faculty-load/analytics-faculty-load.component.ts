import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService } from '../../../../../services/admin/analytics/analytics.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-analytics-faculty-load',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, MatProgressSpinnerModule],
  templateUrl: './analytics-faculty-load.component.html',
  styleUrl: './analytics-faculty-load.component.scss',
})
export class AnalyticsFacultyLoadComponent implements OnInit, OnDestroy {
  isLoading = true;
  private destroy$ = new Subject<void>();

  // Bar Chart Configuration for Load Distribution
  public barChartOptions: ChartConfiguration['options'] = {
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
          label: (context) => ` ${context.dataset.label}: ${context.raw} faculty`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Number of Faculty',
          font: { family: "'Inter', sans-serif", size: 11 }
        }
      },
      x: {
        title: {
          display: true,
          text: 'Load Status',
          font: { family: "'Inter', sans-serif", size: 11 }
        }
      }
    }
  };

  public barChartData: ChartData<'bar'> = {
    labels: ['Underloaded', 'Optimal', 'Overloaded'],
    datasets: [
      {
        data: [0, 0, 0],
        label: 'Faculty Count',
        backgroundColor: [
          '#FFC107', // Amber for Underloaded
          '#4CAF50', // Green for Optimal
          '#F44336'  // Red for Overloaded
        ],
        borderRadius: 4
      }
    ]
  };

  public barChartType: ChartType = 'bar';

  constructor(private analyticsService: AnalyticsService) {}

  // Initializes the component and subscribes to term changes
  ngOnInit(): void {
    this.analyticsService.selectedTerm$
      .pipe(takeUntil(this.destroy$))
      .subscribe((termId) => {
        if (termId) {
          this.fetchFacultyLoad(termId);
        }
      });
  }

  // Cleanup subscriptions on component destruction
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Fetches aggregated faculty load data and computes distribution
  private fetchFacultyLoad(termId: number): void {
    this.isLoading = true;
    
    this.analyticsService.getFacultyLoadDistribution(termId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any[]) => {
          this.processLoadDistribution(data);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error fetching faculty load:', error);
          this.isLoading = false;
        }
      });
  }

  // Categories faculty into Underloaded, Optimal, or Overloaded bins
  private processLoadDistribution(facultyLoads: any[]): void {
    let underloaded = 0;
    let optimal = 0;
    let overloaded = 0;

    facultyLoads.forEach(f => {
      const assigned = Number(f.assigned_units) || 0;
      const regular = Number(f.regular_units) || 0;
      
      if (assigned < regular) {
        underloaded++;
      } else if (assigned === regular) {
        optimal++;
      } else {
        overloaded++;
      }
    });

    this.barChartData = {
      ...this.barChartData,
      datasets: [{
        ...this.barChartData.datasets[0],
        data: [underloaded, optimal, overloaded]
      }]
    };
  }
}
