import {
  Component,
  OnInit,
  OnDestroy,
  Renderer2,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { Subject, Observable } from 'rxjs';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';

import { DialogFacultyLoginComponent } from
  '../../shared/dialog-faculty-login/dialog-faculty-login.component';
import { DialogAdminLoginComponent } from
  '../../shared/dialog-admin-login/dialog-admin-login.component';
import { SlideshowComponent } from '../../shared/slideshow/slideshow.component';

import { ThemeService } from '../../core/services/theme/theme.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  imports: [
    CommonModule,
    SlideshowComponent,
    MatSymbolDirective,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatRippleModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
})
export class LoginComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private isAdminDialogOpen = false;
  private isFacultyDialogOpen = false;

  readonly slideshowImages = [
    'assets/images/pupt_img_1.webp',
    'assets/images/pupt_img_2.webp',
    'assets/images/pupt_img_3.webp',
    'assets/images/pupt_img_4.webp',
    'assets/images/pupt_img_5.webp',
  ];

  currentBackgroundImage = '';
  isDarkTheme$: Observable<boolean>;

  /**
   * Wire up login dependencies.
   */
  constructor(
    private themeService: ThemeService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    this.isDarkTheme$ = this.themeService.isDarkTheme$;
  }

  /**
   * Initialize the login view state.
   */
  ngOnInit() {
    this.currentBackgroundImage = `url(${this.slideshowImages[0]})`;
    this.showSessionExpiredNotice();
  }

  /**
   * Tear down subscriptions and resources.
   */
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Update the background image when the slideshow changes.
   */
  onSlideChange(index: number) {
    this.currentBackgroundImage = `url(${this.slideshowImages[index]})`;
  }

  /**
   * Open the faculty login dialog.
   */
  openFacultyLoginDialog(): void {
    if (this.isFacultyDialogOpen) return;

    this.isFacultyDialogOpen = true;
    const dialogRef = this.dialog.open(DialogFacultyLoginComponent, {
      disableClose: true,
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe(() => {
      this.isFacultyDialogOpen = false;
    });
  }

  /**
   * Open the admin login dialog.
   */
  openAdminLoginDialog(): void {
    if (this.isAdminDialogOpen) return;

    this.isAdminDialogOpen = true;
    const dialogRef = this.dialog.open(DialogAdminLoginComponent, {
      disableClose: true,
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe(() => {
      this.isAdminDialogOpen = false;
    });
  }

  /**
   * Toggle the current theme preference.
   */
  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  /**
   * Show a snackbar when the session expired and clear the flag.
   */
  private showSessionExpiredNotice(): void {
    const reason = this.route.snapshot.queryParamMap.get('reason');

    if (reason !== 'session-expired') {
      return;
    }

    this.snackBar.open(
      'Session expired. Please log in again.',
      'Close',
      {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      },
    );

    this.router.navigate([], {
      queryParams: { reason: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
