import { Component, inject, OnInit, ViewChild, AfterViewInit, ElementRef, Renderer2, NgZone, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';

import { Observable, Subject } from 'rxjs';
import { map, shareReplay, filter, takeUntil } from 'rxjs/operators';
import { fromEvent } from 'rxjs';

import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatRippleModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';

import { MatSymbolDirective } from '../../../imports/mat-symbol.directive';
import { DialogGenericComponent, DialogData } from '../../../../shared/dialog-generic/dialog-generic.component';
import { DialogChangePasswordComponent } from '../../../../shared/dialog-change-password/dialog-change-password.component';

import { AuthService } from '../../../services/auth/auth.service';
import { ThemeService } from '../../../services/theme/theme.service';
import { CookieService } from 'ngx-cookie-service';

// Added AdminService Import
import { AdminService } from '../../../services/superadmin/management/admin/admin-profile.service';

import { slideInAnimation, fadeAnimation, slideUpDown } from '../../../animations/animations';
import { DialogTermsConditionsComponent } from '../../../../shared/dialog-terms-conditions/dialog-terms-conditions.component';
import { HasPermissionDirective } from '../../../directives/has-permission.directive';

@Component({
  selector: 'app-admin-main',
  templateUrl: './admin-main.component.html',
  styleUrls: ['./admin-main.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatRippleModule,
    MatTooltipModule,
    MatMenuModule,
    MatSymbolDirective,
    HasPermissionDirective,
  ],
  animations: [fadeAnimation, slideInAnimation, slideUpDown],
})
export class AdminMainComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('drawer') drawer!: MatSidenav;

  private destroy$ = new Subject<void>();
  private isInitialLoad = true;
  private resizeObserver!: ResizeObserver;
  public isDropdownOpen = false;
  private documentClickListener!: () => void;

  private readonly MOBILE_BREAKPOINT = 512;
  private readonly SELECTORS = {
    mobileDropdown: '.mobile-dropdown',
    bottomNavLastItem: '.bottom-nav-item:last-child',
    profileIcon: '.profile-icon',
  };

  private breakpointObserver = inject(BreakpointObserver);
  public pageTitle = '';
  public accountName!: string;
  public accountRole!: string;
  public accountEmail!: string;
  public isReportsView: boolean = false;
  public isProfileRoute: boolean = false;
  public accountProfilePictureUrl: string | null = null;

  public isHandset$: Observable<boolean> = this.breakpointObserver
    .observe(Breakpoints.Handset)
    .pipe(
      map((result) => result.matches),
      shareReplay()
    );

  constructor(
    public themeService: ThemeService,
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private dialog: MatDialog,
    private cookieService: CookieService,
    private el: ElementRef,
    private renderer: Renderer2,
    private ngZone: NgZone,
    private adminService: AdminService // Injected AdminService
  ) {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.isReportsView = event.urlAfterRedirects.includes('/reports');
        this.isProfileRoute = event.urlAfterRedirects.includes('/profile');
      });
  }

  ngOnInit(): void {
    this.initializeUserData();
    
    this.authService.profilePictureUrl$
      .pipe(takeUntil(this.destroy$))
      .subscribe(url => this.accountProfilePictureUrl = url);
    
    if (this.cookieService.get('termsAccepted') !== 'true') {
      this.dialog.open(DialogTermsConditionsComponent, {
        disableClose: true,
        autoFocus: true,
      });
    }

    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd
        )
      )
      .subscribe(() => this.setPageTitle());

    this.setPageTitle();
  }

  ngAfterViewInit() {
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

  private initializeUserData(): void {
    this.accountName = this.authService.getUserName();
    this.accountRole = this.toTitleCase(this.authService.getUserRole());
    this.accountEmail = this.authService.getUserEmail();

    // Fetch the profile data on initial load to ensure the admin picture populates
    this.adminService.getProfile().subscribe({
      next: (profile) => {
        if (profile && profile.profile_picture_url) {
          this.accountProfilePictureUrl = profile.profile_picture_url;
          this.authService.updateProfilePictureUrl(profile.profile_picture_url);
        }
      },
      error: (err) => console.error('Failed to load admin profile picture on startup', err)
    });
  }

  public toggleTheme() {
    this.themeService.toggleTheme();
  }

  private toTitleCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private setPageTitle(): void {
    const pageTitle = this.route.snapshot.firstChild?.data['pageTitle'];
    this.pageTitle = pageTitle;
    this.isProfileRoute = this.router.url.includes('/profile');
  }

  public logout() {
    const confirmDialogRef = this.dialog.open<
      DialogGenericComponent,
      DialogData,
      string
    >(DialogGenericComponent, {
      data: {
        title: 'Log Out',
        content:
          'Are you sure you want to log out? This will end your current session.',
        actionText: 'Log Out',
        cancelText: 'Cancel',
        action: 'Log Out',
      },
      autoFocus: true,
      disableClose: true,
      panelClass: 'dialog-base',
    });

    confirmDialogRef.afterClosed().subscribe((result) => {
      if (result === 'Log Out') {
        this.showLoadingAndLogout();
      }
    });
  }

  private showLoadingAndLogout() {
    const loadingDialogRef = this.dialog.open(DialogGenericComponent, {
      data: {
        title: 'Logging Out',
        content: 'Currently logging you out...',
        showProgressBar: true,
      },
      disableClose: true,
      autoFocus: true,
    });

    this.authService.logout().subscribe({
      next: () => {
        loadingDialogRef.close();
      },
      error: (error) => {
        console.error('Logout failed', error);
        loadingDialogRef.close();
      },
    });
  }

  openChangePasswordDialog() {
    const dialogRef = this.dialog.open(DialogChangePasswordComponent, {
      disableClose: true,
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
          disableClose: true,
          autoFocus: true,
        });
      }
    });
  }

  toggleDropdown(event: Event) {
    event.stopPropagation();
    this.isDropdownOpen = !this.isDropdownOpen;
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

  private navigateToProfile() {
    this.router.navigate(['/admin/profile']);
  }

  closeDropdown() {
    this.isDropdownOpen = false;
  }

  private setupDocumentClickListener() {
    this.documentClickListener = this.renderer.listen(
      'document',
      'click',
      (event: Event) => {
        const dropdownElement = this.el.nativeElement.querySelector(
          this.SELECTORS.mobileDropdown
        );
        const triggerElement = this.el.nativeElement.querySelector(
          this.SELECTORS.bottomNavLastItem
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
}