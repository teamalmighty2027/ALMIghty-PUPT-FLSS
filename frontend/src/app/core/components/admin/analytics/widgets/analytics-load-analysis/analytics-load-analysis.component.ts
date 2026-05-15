import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService } from '../../../../../services/admin/analytics/analytics.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';

import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

import { 
  AnalyticsInsightComponent 
} from '../analytics-insight/analytics-insight.component';

@Component({
  selector: 'app-analytics-load-analysis',
  standalone: true,
  imports: [
    CommonModule, 
    BaseChartDirective, 
    MatProgressSpinnerModule,
    MatIconModule,
    FormsModule,
    MatInputModule,
    MatFormFieldModule,
    AnalyticsInsightComponent
  ],
  templateUrl: './analytics-load-analysis.component.html',
  styleUrl: './analytics-load-analysis.component.scss'
})
export class AnalyticsLoadAnalysisComponent implements OnInit, OnDestroy {
  isLoading = true;
  isEmpty = false;
  searchTerm = '';
  private allAnalysisData: any[] = [];
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

  public barChartType: 'bar' = 'bar';

  public insightText = '';
  public insightType: 'info' | 'success' | 'warning' | 'alert' = 'info';

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
          this.allAnalysisData = data || [];
          if (this.allAnalysisData.length === 0) {
            this.isEmpty = true;
            this.isLoading = false;
            return;
          }
          this.filterAndProcessData();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error fetching load analysis:', error);
          this.isLoading = false;
          this.isEmpty = true;
        }
      });
  }

  /** Handles search input changes */
  onSearchChange(): void {
    this.filterAndProcessData();
  }

  /** Expose hasData for the template to keep search bar visible */
  get hasData(): boolean {
    return this.allAnalysisData.length > 0;
  }

  /** Filters and processes analysis data into chart-friendly format */
  private filterAndProcessData(): void {
    let filtered = this.allAnalysisData;

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(f => f.name.toLowerCase().includes(term));
    }

    // Sort by delta descending
    const sorted = [...filtered].sort((a, b) => b.delta - a.delta);
    
    // Show top 15 by absolute delta if no search term, otherwise show all matching
    const displayData = this.searchTerm.trim() 
      ? sorted 
      : sorted.filter(f => f.delta !== 0)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 10)
        .sort((a, b) => b.delta - a.delta);

    if (displayData.length === 0) {
      this.isEmpty = true;
      this.insightText = '';
      this.barChartData = { labels: [], datasets: [{ data: [], backgroundColor: [] }] };
      return;
    }

    this.isEmpty = false;
    this.facultyMetadata = displayData;
    this.barChartData = {
      labels: displayData.map(f => f.name),
      datasets: [
        {
          data: displayData.map(f => f.delta),
          backgroundColor: displayData.map(f => f.delta > 0 ? '#F44336' : '#FFC107'),
          borderRadius: 4
        }
      ]
    };

    this.generateInsight();
  }

  /** Generates a plain-text insight based on current filtered data */
  private generateInsight(): void {
    const overloaded = this.allAnalysisData.filter(f => f.delta > 0).length;
    const underloaded = this.allAnalysisData.filter(f => f.delta < 0).length;

    if (overloaded === 0 && underloaded === 0) {
      this.insightText = 'All faculty are currently loaded within their regular unit limits.';
      this.insightType = 'success';
      return;
    }

    const mostExtreme = [...this.allAnalysisData].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    
    this.insightText = `${overloaded} faculty are overloaded and ${underloaded} are underloaded. Most extreme case: ${mostExtreme.name} at ${mostExtreme.delta > 0 ? '+' : ''}${mostExtreme.delta} units.`;
    this.insightType = overloaded > 3 ? 'alert' : (overloaded > 0 ? 'warning' : 'info');
  }
}
