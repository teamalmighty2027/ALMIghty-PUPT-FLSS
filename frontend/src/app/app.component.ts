import { Component, OnInit, HostListener } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SwUpdate } from '@angular/service-worker';

import { ThemeService } from './core/services/theme/theme.service';
import { TitleService } from './core/services/title/title.service';
import { routeAnimation } from './core/animations/animations';
import { OfflineStatusComponent } from './shared/offline-status/offline-status.component';

/** Prevents a broken service worker from reloading and cold-starting fonts on every visit. */
const SW_UNRECOVERABLE_RELOAD_KEY = 'pupt-flss-sw-unrecoverable-reload';
let unrecoverableReloadStarted = false;

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, OfflineStatusComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  animations: [routeAnimation],
})
export class AppComponent implements OnInit {
  title = 'PUPT-FLSS';

  constructor(
    private themeService: ThemeService,
    private titleService: TitleService,
    private swUpdate: SwUpdate,
  ) {}

  ngOnInit() {
    this.titleService.initializeTitleService();
    this.themeService.loadTheme();
    this.handleUnrecoverableState();
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

  // Reload once when the worker is unrecoverable. Leave Cache Storage intact so
  // icon fonts are not downloaded again on every failed check.
  private handleUnrecoverableState(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.unrecoverable.subscribe((event) => {
      console.error('Service worker unrecoverable state:', event.reason);
      this.reloadOnceAfterUnrecoverable();
    });
  }

  private reloadOnceAfterUnrecoverable(): void {
    if (unrecoverableReloadStarted) {
      return;
    }

    try {
      if (sessionStorage.getItem(SW_UNRECOVERABLE_RELOAD_KEY)) {
        return;
      }
      sessionStorage.setItem(SW_UNRECOVERABLE_RELOAD_KEY, '1');
    } catch {
      // Storage can be blocked; the in-memory flag still limits this page.
    }

    unrecoverableReloadStarted = true;
    document.location.reload();
  }

  // Subscribe to service worker updates and notify or reload
  private checkForUpdates() {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe((event) => {
        if (event.type === 'VERSION_READY') {
          this.swUpdate.activateUpdate().then(() => {
            // Wait 250ms for cache swap completion before reload
            setTimeout(() => {
              document.location.reload();
            }, 250);
          });
        }

        if (event.type === 'VERSION_INSTALLATION_FAILED') {
          console.error(
            'Service worker installation failed:',
            event.error
          );
        }
      });

      // Force update check on startup
      this.swUpdate.checkForUpdate().catch((err) => {
        console.error('Error checking updates on startup:', err);
      });
    }
  }
}
