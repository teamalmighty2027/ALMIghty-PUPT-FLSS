import { Component, AfterViewInit, ElementRef, Renderer2, OnDestroy, NgZone, OnInit } from '@angular/core';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';

import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatRippleModule } from '@angular/material/core';
import { MatSymbolDirective } from '../../../imports/mat-symbol.directive';

import { Subject, fromEvent } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

import { DialogGenericComponent, DialogData } from '../../../../shared/dialog-generic/dialog-generic.component';
import { DialogChangePasswordComponent } from '../../../../shared/dialog-change-password/dialog-change-password.component';

import { ThemeService } from '../../../services/theme/theme.service';
import { AuthService } from '../../../services/auth/auth.service';

import { slideUpDown } from '../../../animations/animations';
import { DialogTermsConditionsComponent } from '../../../../shared/dialog-terms-conditions/dialog-terms-conditions.component';
import { SafeStorage } from '../../../utils/safe-storage.utils';
import { FacultyService } from '../../../services/superadmin/management/faculty/faculty.service';

@Component({
  selector: 'app-faculty-main',
  templateUrl: './faculty-main.component.html',
  styleUrls: ['./faculty-main.component.scss'],
  imports: [
    RouterModule,
    CommonModule,
    MatTooltipModule,
    MatSymbolDirective,
    MatRippleModule,
    MatMenuModule,
  ],
  animations: [slideUpDown],
})
export class FacultyMainComponent implements OnInit, AfterViewInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private isInitialLoad = true;
  private resizeObserver!: ResizeObserver;
  public isDropdownOpen = false;
  private documentClickListener!: () => void;

  private readonly MOBILE_BREAKPOINT = 512;
  private readonly SLIDER_TRANSITION_SCALE = 0.95;
  private readonly DIALOG_CLASSES = {
    base: 'dialog-base',
  };
  private readonly SELECTORS = {
    navbar: '.header-navbar',
    slider: '.slider',
    activeLink: 'a.active',
    mobileDropdown: '.mobile-dropdown',
    dropdownMenu: '.dropdown-menu',
    bottomNavLastItem: '.bottom-nav-item:last-child',
    profileIcon: '.profile-icon',
  };

  public facultyName: string | null = '';
  public facultyEmail: string | null = '';
  public facultyProfilePictureUrl: string | null = null;

  constructor(
    public themeService: ThemeService,
    private el: ElementRef,
    private renderer: Renderer2,
    private router: Router,
    private ngZone: NgZone,
    public authService: AuthService,
    private dialog: MatDialog,
    private facultyService: FacultyService
  ) {}

  navigateToProfile() {
    this.router.navigate(['/faculty/profile']);
    this.isDropdownOpen = false;
  }

  ngOnInit(): void {
    this.loadFacultyInfo();

    this.authService.profilePictureUrl$
      .pipe(takeUntil(this.destroy$))
      .subscribe(url => this.facultyProfilePictureUrl = url);

    // Listen for real-time name updates!
    this.authService.userName$
      .pipe(takeUntil(this.destroy$))
      .subscribe(name => {
        if (name) {
          this.facultyName = name;
        } else {
          this.facultyName = this.authService.getUserName();
        }
      });

    if (SafeStorage.getItem('termsAccepted') !== 'true') {
      this.dialog.open(DialogTermsConditionsComponent, {
        disableClose: true,
        autoFocus: true,
        panelClass: 'terms-dialog-panel',
      });
    }
  }

  ngAfterViewInit() {
    this.setupSlider();
    this.setupNavigationEvents();
    this.setupResizeObserver();
    this.setupDocumentClickListener();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.removeDocumentClickListener();
  }

  private loadFacultyInfo(): void {
    this.facultyName = this.authService.getUserName();
    this.facultyEmail = this.authService.getUserEmail();

    // Fetch the profile data on initial load
    this.facultyService.getProfile().subscribe({
      next: (profile: any) => {
        // Evaluate profile completion instantly on load!
        this.authService.updateProfileCompletionStatus(profile, this.authService.getUserRole());

        if (profile && profile.profile_picture_url) {
          // Set the local variable for the navbar
          this.facultyProfilePictureUrl = profile.profile_picture_url;
          
          // Optionally push it to the auth service so other components stay synced
          this.authService.updateProfilePictureUrl(profile.profile_picture_url);
        }
      },
      error: (err) => console.error('Failed to load profile picture on startup', err)
    });
  }

  toggleDropdown(event: Event) {
    event.stopPropagation();
    
    // We ONLY need this manual toggle for mobile now. 
    // Desktop is handled automatically by mat-menu!
    if (window.innerWidth <= this.MOBILE_BREAKPOINT) {
      this.isDropdownOpen = !this.isDropdownOpen;
    }
  }

  onMenuAction(action: string) {
    if (action === 'profile') {
      this.navigateToProfile();
    } else if (action === 'theme' || action === 'toggle-theme') {
      this.toggleTheme();
    } else if (action === 'logout') {
      this.logout();
    } else if (action === 'change-password') {
      this.openChangePasswordDialog();
    }
  }

  closeDropdown() {
    this.isDropdownOpen = false;
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }

  private setupNavigationEvents() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
        setTimeout(() => this.updateSliderPosition(), 0);
      });

    setTimeout(() => this.updateSliderPosition(), 0);

    this.ngZone.runOutsideAngular(() => {
      fromEvent(window, 'resize')
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => {
          this.ngZone.run(() => {
            this.updateSliderPosition();
          });
        });
    });
  }

  private setupSlider() {
    const navbar = this.el.nativeElement.querySelector(this.SELECTORS.navbar);
    const navItems = navbar.querySelectorAll('a');

    navItems.forEach((item: HTMLElement) => {
      item.addEventListener('click', () => {
        this.isInitialLoad = false;
        this.updateSliderPosition();
      });
    });
  }

  private setupResizeObserver() {
    const navbar = this.el.nativeElement.querySelector(this.SELECTORS.navbar);

    this.resizeObserver = new ResizeObserver(() => {
      this.ngZone.run(() => {
        this.updateSliderPosition();
      });
    });

    this.resizeObserver.observe(navbar);
  }

  private setupDocumentClickListener() {
    this.documentClickListener = this.renderer.listen(
      'document',
      'click',
      (event: Event) => {
        const dropdownElement = this.el.nativeElement.querySelector(
          window.innerWidth <= this.MOBILE_BREAKPOINT
            ? this.SELECTORS.mobileDropdown
            : this.SELECTORS.dropdownMenu,
        );
        const triggerElement = this.el.nativeElement.querySelector(
          window.innerWidth <= this.MOBILE_BREAKPOINT
            ? this.SELECTORS.bottomNavLastItem
            : this.SELECTORS.profileIcon,
        );

        if (
          !dropdownElement?.contains(event.target as Node) &&
          !triggerElement?.contains(event.target as Node)
        ) {
          this.ngZone.run(() => {
            this.closeDropdown();
          });
        }
      },
    );
  }

  private removeDocumentClickListener() {
    if (this.documentClickListener) {
      this.documentClickListener();
    }
  }

  updateSliderPosition() {
    const navbar = this.el.nativeElement.querySelector(this.SELECTORS.navbar);
    const slider = navbar.querySelector(this.SELECTORS.slider);
    const activeItem = navbar.querySelector(this.SELECTORS.activeLink);

    if (activeItem) {
      if (this.isInitialLoad) {
        this.renderer.setStyle(slider, 'transition', 'none');
        this.renderer.setStyle(slider, 'width', `${activeItem.offsetWidth}px`);
        this.renderer.setStyle(slider, 'left', `${activeItem.offsetLeft}px`);
        this.renderer.setStyle(slider, 'opacity', '1');
        this.renderer.setStyle(slider, 'transform', 'scale(1)');

        slider.offsetHeight;
        this.renderer.removeStyle(slider, 'transition');
      } else {
        this.renderer.setStyle(slider, 'width', `${activeItem.offsetWidth}px`);
        this.renderer.setStyle(slider, 'left', `${activeItem.offsetLeft}px`);
        this.renderer.setStyle(slider, 'opacity', '1');
        this.renderer.setStyle(slider, 'transform', 'scale(1)');
      }
    } else {
      this.renderer.setStyle(slider, 'opacity', '0');
      this.renderer.setStyle(
        slider,
        'transform',
        `scale(${this.SLIDER_TRANSITION_SCALE})`,
      );
    }

    this.isInitialLoad = false;
  }

  logout() {
    const dialogConfig: DialogData = {
      title: 'Log Out',
      content:
        'Are you sure you want to log out? This will end your current session.',
      actionText: 'Log Out',
      cancelText: 'Cancel',
      action: 'Log Out',
    };

    const confirmDialogRef = this.dialog.open(DialogGenericComponent, {
      data: dialogConfig,
      panelClass: 'dialog-base',
      autoFocus: true,
    });

    confirmDialogRef.afterClosed().subscribe((result) => {
      if (result === dialogConfig.action) {
        const loadingDialogConfig: DialogData = {
          title: 'Logging Out',
          content: 'Currently logging you out...',
          showProgressBar: true,
        };

        const loadingDialogRef = this.dialog.open(DialogGenericComponent, {
          data: loadingDialogConfig,
          autoFocus: true,
        });

        this.authService.logout().subscribe({
          next: () => {
            loadingDialogRef.close();
          },
          error: () => {
            loadingDialogRef.close();
          },
        });
      }
    });
  }

  openChangePasswordDialog() {
    const dialogRef = this.dialog.open(DialogChangePasswordComponent, {
      autoFocus: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.message) {
        const successDialogConfig: DialogData = {
          title: 'Success!',
          content: result.message,
          showProgressBar: false,
          actionText: 'Close',
        };

        this.dialog.open(DialogGenericComponent, {
          data: successDialogConfig,
          autoFocus: true,
        });
      }
    });
  }
}