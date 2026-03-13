import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MatTabsModule } from '@angular/material/tabs';
import { MatSymbolDirective } from '../../../imports/mat-symbol.directive';

import { ReportsService } from '../../../services/admin/reports/reports.service';

@Component({
  selector: 'app-reports',
  imports: [CommonModule, MatTabsModule, RouterModule, MatSymbolDirective, FormsModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ReportsComponent implements OnInit {
  tabs: { label: string; route: string; icon: string }[] = [
    { label: 'Faculty', route: 'faculty', icon: 'person' },
    { label: 'Programs', route: 'programs', icon: 'school' },
    { label: 'Rooms', route: 'rooms', icon: 'meeting_room' },
  ];
  selectedTabIndex = 0;

  availableTerms: any[] = [];
  selectedTermId: number | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private reportsService: ReportsService,
  ) {}

  ngOnInit() {
    this.reportsService.clearAllCaches();
    this.loadTerms();

    if (this.route.firstChild === null) {
      this.router.navigate([this.tabs[0].route], { relativeTo: this.route });
    } else {
      const currentPath = this.route.firstChild.snapshot.url[0]?.path;
      const tabIndex = this.tabs.findIndex((tab) => tab.route === currentPath);
      if (tabIndex !== -1) {
        this.selectedTabIndex = tabIndex;
      }
    }
  }

  loadTerms() {
    this.reportsService.getAllTermsForDropdown().subscribe((data) => {
      this.availableTerms = data;
      // Find the default active one to set initially since we removed the "null" option
      const activeTerm = data.find(t => t.is_active === 1);
      if (activeTerm) {
         this.selectedTermId = activeTerm.active_semester_id;
         // Broadcast the initial active term to child components
         this.onTermChange(); 
      }
    });
  }

  onTermChange() {
    this.reportsService.setSelectedTerm(this.selectedTermId);
  }

  onTabChange(event: any) {
    this.router.navigate([this.tabs[event.index].route], {
      relativeTo: this.route,
    });
  }

  // Helper method to format semester numbers into words
  getSemesterLabel(semesterNumber: number): string {
    switch (semesterNumber) {
      case 1:
        return '1st Semester';
      case 2:
        return '2nd Semester';
      case 3:
        return 'Summer';
      default:
        return `Sem ${semesterNumber}`;
    }
  }
}