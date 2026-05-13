import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService } from '../../../../../services/admin/analytics/analytics.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-analytics-faculty-type',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, MatProgressSpinnerModule],
  templateUrl: './analytics-faculty-type.component.html',
  styleUrl: './analytics-faculty-type.component.scss',
})
export class AnalyticsFacultyTypeComponent implements OnInit, OnDestroy {
  isLoading = true;
  private destroy$ = new Subject<void>();

  // Doughnut Chart Configuration
  public doughnutChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            family: "'Inter', sans-serif",
            size: 12
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 13 }
      }
    },
    cutout: '70%'
  };

  public doughnutChartData: ChartData<'doughnut'> = {
    labels: [],
    datasets: [{
      data: [],
      backgroundColor: [
        '#800000', // Maroon
        '#A52A2A', // Brown
        '#D2691E', // Chocolate
        '#CD5C5C', // IndianRed
        '#E9967A'  // DarkSalmon
      ],
      hoverOffset: 15,
      borderRadius: 5,
      spacing: 2
    }]
  };

  public doughnutChartType: 'doughnut' = 'doughnut';

  constructor(private analyticsService: AnalyticsService) {}

  // Initializes the component by fetching faculty composition data
  ngOnInit(): void {
    this.fetchFacultyComposition();
  }

  // Cleanup subscriptions on component destruction
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Fetches aggregated faculty type data from the backend
  private fetchFacultyComposition(): void {
    this.isLoading = true;
    
    this.analyticsService.getFacultyTypeComposition()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any[]) => {
          this.doughnutChartData.labels = data.map(item => item.faculty_type);
          this.doughnutChartData.datasets[0].data = data.map(item => item.count);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error fetching faculty composition:', error);
          this.isLoading = false;
        }
      });
  }
}
