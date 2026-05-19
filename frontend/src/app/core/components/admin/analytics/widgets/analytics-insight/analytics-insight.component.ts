import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-analytics-insight',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './analytics-insight.component.html',
  styleUrl: './analytics-insight.component.scss'
})
export class AnalyticsInsightComponent {
  @Input() text = '';
  @Input() type: 'info' | 'success' | 'warning' | 'alert' = 'info';
  @Input() icon?: string;

  /** Derives icon from type if not explicitly set */
  get resolvedIcon(): string {
    if (this.icon) return this.icon;
    const map = { 
      info: 'info', 
      success: 'check_circle',
      warning: 'warning', 
      alert: 'error' 
    };
    return map[this.type];
  }
}
