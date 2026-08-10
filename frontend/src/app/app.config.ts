import { ApplicationConfig, provideZoneChangeDetection, isDevMode, ErrorHandler } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

import { MAT_RIPPLE_GLOBAL_OPTIONS, RippleGlobalOptions } from '@angular/material/core';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialogConfig } from '@angular/material/dialog';

import { AuthHeaderInterceptor } from './core/utils/auth-header.interceptor';
import { CookieService } from 'ngx-cookie-service';

import { routes } from './app.routes';
import { AuthGuard } from './core/guards/auth.guard';
import { Title } from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';
import { GlobalErrorHandler } from './core/handlers/global-error.handler';

/** Global Material Ripple Configuration */
const globalRippleConfig: RippleGlobalOptions = {
  animation: {
    enterDuration: 500,
    exitDuration: 500,
  },
};

/** Global Material Dialog Configuration */
const globalDialogConfig: MatDialogConfig = {
  enterAnimationDuration: 150,
  exitAnimationDuration: 250,
};

export const appConfig: ApplicationConfig = {
  providers: [
    /** Core Angular Providers */
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(
      withInterceptors([AuthHeaderInterceptor])
    ),

    /** Custom Providers */
    AuthGuard,
    CookieService,
    Title,
    provideCharts(withDefaultRegisterables()),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },

    /** Angular Material Configurations */
    { provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: globalRippleConfig },
    { provide: MAT_DIALOG_DEFAULT_OPTIONS, useValue: globalDialogConfig }, 
    provideServiceWorker('ngsw-worker.js', {
        enabled: !isDevMode(),
        registrationStrategy: 'registerImmediately'
    }),
  ],
};
