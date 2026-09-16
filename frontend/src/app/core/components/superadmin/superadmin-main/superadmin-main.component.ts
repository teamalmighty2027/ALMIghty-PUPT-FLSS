import { Component, inject, OnInit, ViewChild, AfterViewInit, OnDestroy, ElementRef, Renderer2, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';

import { Observable, Subject } from 'rxjs';
import { map, shareReplay, filter, takeUntil } from 'rxjs/operators';

import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';

import { MatSymbolDirective } from '../../../imports/mat-symbol.directive';
import { DialogGenericComponent, DialogData } from '../../../../shared/dialog-generic/dialog-generic.component';
import { slideInAnimation, fadeAnimation } from '../../../animations/animations';

import { AuthService } from '../../../services/auth/auth.service';
import { ThemeService } from '../../../services/theme/theme.service';
import { DialogChangePasswordComponent } from '../../../../shared/dialog-change-password/dialog-change-password.component';
import { DialogTermsConditionsComponent } from '../../../../shared/dialog-terms-conditions/dialog-terms-conditions.component';
import { SafeStorage } from '../../../utils/safe-storage.utils';
import { MatBadgeModule } from '@angular/material/badge';
import { SystemNoticeService } from '../../../services/superadmin/system-notice/system-notice.service';


@Component({
  selector: 'app-superadmin-main',
  templateUrl: './superadmin-main.component.html',
  styleUrls: ['./superadmin-main.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatSymbolDirective,
    MatTooltipModule,
    MatBadgeModule,
  ],
  animations: [fadeAnimation, slideInAnimation],
})
export class SuperadminMainComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('drawer') drawer!: MatSidenav;

  private breakpointObserver = inject(BreakpointObserver);
  private destroy$ = new Subject<void>();
  private documentClickListener!: () => void;
  public showSidenav = false;
  public isDropdownOpen = false;
  public pageTitle = 'Dashboard';
  public accountName!: string;
  public accountRole!: string;
  public unresolvedNoticesCount = 0;
  public isSidebarPinned: boolean =
    SafeStorage.getItem('superadmin_sidebar_pinned') !== 'false';
  public isMaintenanceExpanded: boolean = false;
  public isLogsExpanded: boolean = false;

  private noticeService = inject(SystemNoticeService);


  private routeTitleMap: Record<string, string> = {
    dashboard: 'Dashboard',
    programs: 'Programs',
    courses: 'Courses',
    curriculum: 'Curriculum',
    rooms: 'Rooms',
    'manage-admin': 'Manage Admin',
    'manage-faculty': 'Manage Faculty',
    'system-notices': 'System Alerts',
    'academic-ranks': 'Academic Ranks',
  };


  isHandset$: Observable<boolean> = this.breakpointObserver
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
    private el: ElementRef,
    private renderer: Renderer2,
    private ngZone: NgZone
  ) {
  }

  ngOnInit(): void {
    this.initializeUserData();
    
    if (SafeStorage.getItem('termsAccepted') !== 'true') {
      this.dialog.open(DialogTermsConditionsComponent, {
        disableClose: true,
        autoFocus: true,
        panelClass: 'terms-dialog-panel',
      });
    }

    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd
        )
      )
      .subscribe(() => {
        this.setPageTitle();
        this.fetchUnresolvedNoticesCount();
        this.checkMaintenanceActive();
        this.checkLogsActive();
      });

    this.fetchUnresolvedNoticesCount();
    this.setPageTitle();
    this.checkMaintenanceActive();
    this.checkLogsActive();

    // Close sidebar on mobile after navigation
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.isHandset$.pipe(takeUntil(this.destroy$)).subscribe(isHandset => {
          if (isHandset && this.drawer?.opened) {
            this.drawer.close();
          }
        }).unsubscribe();
      });

    this.setPageTitle();
  }

  ngAfterViewInit() {
    this.setupDocumentClickListener();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.removeDocumentClickListener();
  }

  private initializeUserData(): void {
    this.accountName = this.authService.getUserName();
    this.accountRole = this.toTitleCase(this.authService.getUserRole());
  }

  public toggleTheme() {
    this.themeService.toggleTheme();
  }

  // Toggles sidebar visibility and stores preference in local storage
  public toggleSidebar(): void {
    this.isSidebarPinned = !this.isSidebarPinned;
    SafeStorage.setItem(
      'superadmin_sidebar_pinned',
      String(this.isSidebarPinned)
    );

    if (this.drawer) {
      this.drawer.toggle();
    }
  }

  // Toggles the expansion state of the maintenance navigation section
  public toggleMaintenanceGroup(): void {
    this.isMaintenanceExpanded = !this.isMaintenanceExpanded;
  }

  // Toggles the expansion state of the logs navigation section
  public toggleLogsGroup(): void {
    this.isLogsExpanded = !this.isLogsExpanded;
  }

  // Checks if current route is part of maintenance section and auto expands it
  private checkMaintenanceActive(): void {
    const currentUrl = this.router.url;
    const maintenanceRoutes = [
      '/superadmin/curriculum',
      '/superadmin/programs',
      '/superadmin/academic-ranks',
      '/superadmin/buildings',
      '/superadmin/rooms',
      '/superadmin/logos',
      '/superadmin/courses',
    ];

    if (maintenanceRoutes.some((path) => currentUrl.includes(path))) {
      this.isMaintenanceExpanded = true;
    }
  }

  // Checks if current route is part of logs section and auto expands it
  private checkLogsActive(): void {
    const currentUrl = this.router.url;
    const logsRoutes = [
      '/superadmin/audit-log',
      '/superadmin/system-notices',
    ];

    if (logsRoutes.some((path) => currentUrl.includes(path))) {
      this.isLogsExpanded = true;
    }
  }

  public toggleDropdown(event: Event) {
    event.stopPropagation();
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  public closeDropdown() {
    this.isDropdownOpen = false;
  }

  private setupDocumentClickListener() {
    this.documentClickListener = this.renderer.listen(
      'document',
      'click',
      (event: Event) => {
        const dropdownElement =
          this.el.nativeElement.querySelector('.dropdown-menu');
        const profileIconElement =
          this.el.nativeElement.querySelector('.profile-icon');

        if (
          !dropdownElement?.contains(event.target as Node) &&
          !profileIconElement?.contains(event.target as Node)
        ) {
          this.ngZone.run(() => {
            this.closeDropdown();
          });
        }
      }
    );
  }

  private removeDocumentClickListener() {
    if (this.documentClickListener) {
      this.documentClickListener();
    }
  }

  private toTitleCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private setPageTitle(): void {
    const childRoute = this.findDeepestChild(this.route);
    const pageTitle =
      childRoute?.snapshot.data['pageTitle'] ||
      this.routeTitleMap[this.router.url.split('/').pop() || ''] ||
      'Dashboard';
    this.pageTitle = childRoute?.snapshot.data['curriculumYear']
      ? `${pageTitle} ${childRoute.snapshot.data['curriculumYear']}`
      : pageTitle;
  }

  private findDeepestChild(route: ActivatedRoute): ActivatedRoute | null {
    let child = route.firstChild;
    while (child?.firstChild) {
      child = child.firstChild;
    }
    return child;
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

  public openChangePasswordDialog() {
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

  /**
   * Fetches the number of unresolved system notices.
   */
  public fetchUnresolvedNoticesCount(): void {
    this.noticeService.getUnresolvedCount().subscribe({
      next: (res) => {
        this.unresolvedNoticesCount = res.count;
      },
      error: (err) => {
        console.error('Failed to fetch unresolved notices count:', err);
      }
    });
  }
}

