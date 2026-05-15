import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService } from '../../../../../services/admin/analytics/analytics.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-analytics-optimal-slots',
  standalone: true,
  imports: [
    CommonModule, 
    MatProgressSpinnerModule,
    MatIconModule,
    MatTooltipModule
  ],
  templateUrl: './analytics-optimal-slots.component.html',
  styleUrl: './analytics-optimal-slots.component.scss'
})
export class AnalyticsOptimalSlotsComponent implements OnInit, OnDestroy {
  isLoading = true;
  isEmpty = false;
  private destroy$ = new Subject<void>();

  days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  timeSlots = [
    '07:00:00', '08:00:00', '09:00:00', '10:00:00', '11:00:00', '12:00:00',
    '13:00:00', '14:00:00', '15:00:00', '16:00:00', '17:00:00', '18:00:00', '19:00:00'
  ];

  recommendations: any[] = [];
  gridData: { [key: string]: { pref: number, sched: number, score: number } } = {};

  constructor(private analyticsService: AnalyticsService) {}

  ngOnInit(): void {
    this.analyticsService.selectedTerm$
      .pipe(takeUntil(this.destroy$))
      .subscribe((termId) => {
        if (termId) {
          this.fetchOptimalSlots(termId);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Fetches preference vs schedule data per slot */
  private fetchOptimalSlots(termId: number): void {
    this.isLoading = true;
    this.isEmpty = false;
    
    this.analyticsService.getOptimalSlots(termId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          if (!data || (data.preferences.length === 0 && data.schedules.length === 0)) {
            this.isEmpty = true;
            this.isLoading = false;
            return;
          }
          this.processSlots(data);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error fetching optimal slots:', error);
          this.isLoading = false;
          this.isEmpty = true;
        }
      });
  }

  /** Processes raw counts into a recommendation grid */
  private processSlots(data: any): void {
    this.gridData = {};
    const prefs = data.preferences || [];
    const scheds = data.schedules || [];

    // Initialize grid
    this.days.forEach(day => {
      this.timeSlots.forEach(time => {
        this.gridData[`${day}-${time}`] = { pref: 0, sched: 0, score: 0 };
      });
    });

    // Fill preferences
    prefs.forEach((p: any) => {
      const key = `${p.day}-${p.start_time}`;
      if (this.gridData[key]) {
        this.gridData[key].pref = p.pref_count;
      }
    });

    // Fill schedules
    scheds.forEach((s: any) => {
      const key = `${s.day}-${s.start_time}`;
      if (this.gridData[key]) {
        this.gridData[key].sched = s.sched_count;
      }
    });

    // Calculate scores (Opportunity Score)
    // Score = Pref Count - Sched Count
    // We want high preference but low usage.
    this.recommendations = [];
    Object.keys(this.gridData).forEach(key => {
      const slot = this.gridData[key];
      slot.score = slot.pref - slot.sched;
      
      if (slot.score > 0) {
        const [day, time] = key.split('-');
        this.recommendations.push({
          day,
          time: this.formatTime(time),
          score: slot.score,
          pref: slot.pref,
          sched: slot.sched
        });
      }
    });

    // Sort by score descending
    this.recommendations.sort((a, b) => b.score - a.score);
    this.recommendations = this.recommendations.slice(0, 5);
  }

  /** Formats 24h time to 12h for display */
  private formatTime(time: string): string {
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }

  /** Returns background intensity based on score */
  getScoreColor(score: number): string {
    if (score <= 0) return 'transparent';
    const opacity = Math.min(score / 5, 1) * 0.8;
    return `rgba(76, 175, 80, ${opacity})`; // Green for opportunity
  }
}
