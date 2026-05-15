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
  selector: 'app-analytics-load-analysis',
  standalone: true,
  imports: [
    CommonModule, 
    BaseChartDirective, 
    MatProgressSpinnerModule,
    MatIconModule
  ],
  templateUrl: './analytics-load-analysis.component.html',
  styleUrl: './analytics-load-analysis.component.scss'
})
export class AnalyticsLoadAnalysisComponent implements OnInit, OnDestroy {
  isLoading = true;
  isEmpty = false;
  private destroy$ = new Subject<void>();
  private facultyMetadata: any[] = [];

  // Diverging Bar Chart Configuration
  public barChartOptions: ChartConfiguration<'bar'>['options'] = {
    indexAxis: 'y', // Horizontal bars
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const val = context.raw;
            const faculty = this.facultyMetadata[context.dataIndex];
            return ` Delta: ${val > 0 ? '+' : ''}${val} Units (Assigned: ${faculty.assigned_units} / Max: ${faculty.regular_units})`;
          }
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Unit Deviation (Assigned - Regular)',
          font: { family: "'Inter', sans-serif", size: 11 }
        },
        grid: {
          color: (context) => context.tick.value === 0 ? '#666' : 'rgba(0,0,0,0.1)',
          lineWidth: (context) => context.tick.value === 0 ? 2 : 1
        }
      },
      y: {
        ticks: { autoSkip: false }
      }
    }
  };

  public barChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      {
        data: [],
        backgroundColor: [],
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
          this.fetchLoadAnalysis(termId);
        }
      });
  }

  // Cleanup subscriptions on component destruction
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Fetches faculty load analysis data (overloaded/underloaded deltas) */
  private fetchLoadAnalysis(termId: number): void {
    this.isLoading = true;
    this.isEmpty = false;
    
    this.analyticsService.getFacultyLoadAnalysis(termId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any[]) => {
          if (!data || data.length === 0) {
            this.isEmpty = true;
            this.isLoading = false;
            return;
          }
          this.processAnalysis(data);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error fetching load analysis:', error);
          this.isLoading = false;
          this.isEmpty = true;
        }
      });
  }

  /** Processes load analysis data into chart-friendly format */
  private processAnalysis(analysis: any[]): void {
    // Sort by delta descending
    const sorted = [...analysis].sort((a, b) => b.delta - a.delta);
    
    // Show top 15 by absolute delta.
    const filtered = sorted.filter(f => f.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 15)
      .sort((a, b) => b.delta - a.delta);

    if (filtered.length === 0) {
      this.isEmpty = true;
      return;
    }

    this.facultyMetadata = filtered;
    this.barChartData = {
      labels: filtered.map(f => f.name),
      datasets: [
        {
          data: filtered.map(f => f.delta),
          backgroundColor: filtered.map(f => f.delta > 0 ? '#F44336' : '#FFC107'),
          borderRadius: 4
        }
      ]
    };
  }
}
