import { Component, OnInit, HostListener } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SwUpdate } from '@angular/service-worker';

import { ThemeService } from './core/services/theme/theme.service';
import { TitleService } from './core/services/title/title.service';
import { routeAnimation } from './core/animations/animations';
import { OfflineStatusComponent } from './shared/offline-status/offline-status.component';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, OfflineStatusComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  animations: [routeAnimation],
})
export class AppComponent implements OnInit {
  constructor(
    private themeService: ThemeService,
    private titleService: TitleService,
    private swUpdate: SwUpdate,
  ) {}

  ngOnInit() {
    this.titleService.initializeTitleService();
    this.themeService.loadTheme();
    this.checkForUpdates();
  }

  getRouteState(outlet: RouterOutlet) {
    const parentPath =
      outlet?.activatedRouteData?.['role'] ||
      outlet?.activatedRouteData?.['animation'] ||
      'default';
    return parentPath;
  }

  // Trigger update checks when tab becomes active (focused)
  @HostListener('document:visibilitychange', [])
  onVisibilityChange() {
    if (this.swUpdate.isEnabled && document.visibilityState === 'visible') {
      this.swUpdate.checkForUpdate().catch((err) => {
        console.error('Error checking for updates:', err);
      });
    }
  }

  private checkForUpdates() {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe((event) => {
        
        if (event.type === 'VERSION_READY') {
          this.swUpdate.activateUpdate().then(() => {
            document.location.reload();
          });
        }
        
      });
    }
  }
}