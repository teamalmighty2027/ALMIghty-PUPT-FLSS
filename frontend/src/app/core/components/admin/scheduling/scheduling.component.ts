import { Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { MatSymbolDirective } from '../../../imports/mat-symbol.directive';

@Component({
  selector: 'app-scheduling-faculty',
  imports: [MatTabsModule, MatSymbolDirective, RouterOutlet],
  templateUrl: './scheduling.component.html',
  styleUrl: './scheduling.component.scss'
})
export class SchedulingComponent {
  tabs: { label: string, route: string, icon: string }[] = [
    { label: 'Programs', route: 'programs', icon: 'school' },
    { label: 'Faculty', route: 'faculty', icon: 'person' },
  ];
  selectedTabIndex = 0;

  constructor(
    private router: Router,
    private route: ActivatedRoute
  ) {}

  onTabChange(event: any) {
    this.router.navigate([this.tabs[event.index].route],
        { relativeTo: this.route }
    );
  }
}
