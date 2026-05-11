import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService } from '../../../../../services/admin/analytics/analytics.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-analytics-room-utilization',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, MatProgressSpinnerModule],
  templateUrl: './analytics-room-utilization.component.html',
  styleUrl: './analytics-room-utilization.component.scss',
})
export class AnalyticsRoomUtilizationComponent implements OnInit, OnDestroy {
  isLoading = true;
  private destroy$ = new Subject<void>();

  // Bar Chart Configuration
  public barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'x', // Vertical bar chart
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: (context) => ` ${context.raw} hours/week`
        }
      }
    },
    scales: {
      y: {
        ticks: {
          stepSize: 10,
        },
        beginAtZero: true,
        title: {
          display: true,
          text: 'Hours per Week',
          font: { family: "'Inter', sans-serif", size: 11 }
        }
      },
      x: {
        grid: { display: false },
        ticks: {
          autoSkip: true,
          maxRotation: 0,
          minRotation: 0
        }
      }
    }
  };

  public barChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [{
      data: [],
      backgroundColor: '#800000',
      borderRadius: 0,
      barPercentage: 1.0,
      categoryPercentage: 1.0,
      hoverBackgroundColor: '#a52a2a'
    }]
  };

  public barChartType: ChartType = 'bar';

  constructor(private analyticsService: AnalyticsService) {}

  // Initializes the component and subscribes to term changes
  ngOnInit(): void {
    this.analyticsService.selectedTerm$
      .pipe(takeUntil(this.destroy$))
      .subscribe((termId) => {
        if (termId) {
          this.fetchRoomUtilization(termId);
        }
      });
  }

  // Cleanup subscriptions on component destruction
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Fetches aggregated room usage data from the backend
  private fetchRoomUtilization(termId: number): void {
    this.isLoading = true;
    
    this.analyticsService.getRoomUtilization(termId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any[]) => {
          this.barChartData = {
            labels: data.map(item => item.room_code),
            datasets: [{
              ...this.barChartData.datasets[0],
              data: data.map(item => 
                Math.round((item.total_scheduled_minutes / 60) * 10) / 10
              )
            }]
          };
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error fetching room utilization:', error);
          this.isLoading = false;
        }
      });
  }
}
