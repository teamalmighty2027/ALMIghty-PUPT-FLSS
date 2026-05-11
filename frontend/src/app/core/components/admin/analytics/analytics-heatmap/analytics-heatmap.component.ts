import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService } from '../../../../services/admin/analytics/analytics.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-analytics-heatmap',
  standalone: true,
  imports: [CommonModule, MatTooltipModule, MatProgressSpinnerModule],
  templateUrl: './analytics-heatmap.component.html',
  styleUrl: './analytics-heatmap.component.scss',
})
export class AnalyticsHeatmapComponent implements OnInit, OnDestroy {
  days = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 
    'Friday', 'Saturday', 'Sunday'
  ];
  
  timeSlots: string[] = [];
  heatmapData: Map<string, number> = new Map();
  isLoading = true;
  maxCount = 0;

  private destroy$ = new Subject<void>();

  constructor(private analyticsService: AnalyticsService) {
    this.generateTimeSlots();
  }

  // Subscribes to term changes to refresh heatmap data
  ngOnInit(): void {
    this.analyticsService.selectedTerm$
      .pipe(takeUntil(this.destroy$))
      .subscribe((termId) => {
        if (termId) {
          this.fetchHeatmapData(termId);
        }
      });
  }

  // Cleanup subscriptions on component destruction
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Generates 30-minute intervals for the heatmap grid
  private generateTimeSlots() {
    const startHour = 7;
    const endHour = 21; // 9:00 PM
    
    for (let h = startHour; h <= endHour; h++) {
      const hour = h > 12 ? h - 12 : h;
      const ampm = h >= 12 ? 'PM' : 'AM';
      
      this.timeSlots.push(`${hour}:00 ${ampm}`);
      
      if (h < endHour) {
        this.timeSlots.push(`${hour}:30 ${ampm}`);
      }
    }
  }

  // Fetches aggregated schedule density from the backend
  private fetchHeatmapData(termId: number): void {
    this.isLoading = true;
    
    this.analyticsService.getScheduleHeatmap(termId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          const data = response.data || [];
          this.heatmapData.clear();
          this.maxCount = 0;

          data.forEach((item: any) => {
            const key = `${item.day}-${this.formatTime(item.start_time)}`;
            this.heatmapData.set(key, item.count);
            
            if (item.count > this.maxCount) {
              this.maxCount = item.count;
            }
          });

          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error fetching heatmap data:', error);
          this.isLoading = false;
        }
      });
  }

  // Formats HH:mm:ss to a human-readable 12-hour format
  private formatTime(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const ampm = h >= 12 ? 'PM' : 'AM';
    
    return `${hour}:${m === 0 ? '00' : m} ${ampm}`;
  }

  // Returns the class count for a specific day and time slot
  getCount(day: string, time: string): number {
    return this.heatmapData.get(`${day}-${time}`) || 0;
  }

  // Calculates intensity (0.0 to 1.0) relative to max density
  getIntensity(day: string, time: string): number {
    const count = this.getCount(day, time);
    return this.maxCount > 0 ? count / this.maxCount : 0;
  }

  // Determines the background color based on density intensity
  getBgColor(day: string, time: string): string {
    const intensity = this.getIntensity(day, time);
    
    if (intensity === 0) {
      return 'transparent';
    }
    
    return `rgba(128, 0, 0, ${0.1 + intensity * 0.8})`;
  }
}
