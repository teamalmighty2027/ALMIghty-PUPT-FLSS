import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';
import { DialogGenericComponent } from '../dialog-generic/dialog-generic.component';

export interface TutorialStep {
  stepNumber: number;
  title: string;
  description: string;
  icon: string;
  highlight?: string;
}

@Component({
  selector: 'app-dialog-preferences-tutorial',
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatSymbolDirective,
    DialogGenericComponent,
  ],
  templateUrl: './dialog-preferences-tutorial.component.html',
  styleUrls: ['./dialog-preferences-tutorial.component.scss'],
})
export class DialogPreferencesTutorialComponent {
  readonly steps: TutorialStep[] = [
    {
      stepNumber: 1,
      title: 'Welcome to Faculty Preferences',
      description:
        'This page is where you submit your faculty preferences while the submission period is active. ' +
        'Your preferences from the previous academic year are automatically loaded so you can review and adjust them.',
      icon: 'school',
      highlight: 'Submission period is currently open.',
    },
    {
      stepNumber: 2,
      title: 'Removing a Preference',
      description:
        'To remove a preference from your list, click the Delete button on the left side of the preference row. ' +
        'Submitted preferences may ask for confirmation before removal.',
      icon: 'do_not_disturb_on',
    },
    {
      stepNumber: 3,
      title: 'Editing Day and Time',
      description:
        'To edit the preferred day and time for a course, click the "Preferred Day and Time" cell on the right side of the preference row. ' +
        'A picker dialog will open so you can select your schedule.',
      icon: 'edit_calendar',
    },
    {
      stepNumber: 4,
      title: 'Importing Past Preferences',
      description:
        'You can manually import your previous preferences by clicking the Import Past Preferences button above the course list. ' +
        'This lets you quickly restore preferences from an earlier semester.',
      icon: 'history',
    },
    {
      stepNumber: 5,
      title: 'Adding a New Preference',
      description:
        'To add a new course, first select a Program from the panel on the left, then choose a Course from the list that appears. ' +
        'You can also use the Search bar to find a course by code or title, or use the filter to narrow results by Year Level.',
      icon: 'add_circle',
    },
  ];

  currentStepIndex = 0;

  get currentStep(): TutorialStep {
    return this.steps[this.currentStepIndex];
  }

  get isFirstStep(): boolean {
    return this.currentStepIndex === 0;
  }

  get isLastStep(): boolean {
    return this.currentStepIndex === this.steps.length - 1;
  }

  get progressPercent(): number {
    return ((this.currentStepIndex + 1) / this.steps.length) * 100;
  }

  constructor(
    public dialogRef: MatDialogRef<DialogPreferencesTutorialComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Record<string, never>,
    private readonly matDialog: MatDialog,
  ) {}

  next(): void {
    if (!this.isLastStep) {
      this.currentStepIndex++;
    }
  }

  previous(): void {
    if (!this.isFirstStep) {
      this.currentStepIndex--;
    }
  }

  goToStep(index: number): void {
    if (index >= 0 && index < this.steps.length) {
      this.currentStepIndex = index;
    }
  }

  /** "!" — closes without confirmation. */
  finish(): void {
    this.dialogRef.close('finished');
  }

  /** "Skip" and "X" both go through the same confirmation dialog. */
  confirmClose(source: 'skip' | 'x'): void {
    const label = source === 'skip' ? 'skip the tutorial' : 'close the tutorial';
    const confirmRef = this.matDialog.open(DialogGenericComponent, {
      data: {
        title: 'Skip Tutorial?',
        content: `Are you sure you want to ${label}? You can always reopen it by clicking the Tutorial button on the preferences page.`,
        actionText: 'Yes, Skip',
        cancelText: 'Keep Reading',
        action: 'skip',
        actionTextColor: '#ffffff',
        actionBgColor: 'var(--primary-one)',
      },
      panelClass: 'dialog-base',
      autoFocus: false,
    });

    confirmRef.afterClosed().subscribe((result) => {
      if (result === 'skip') {
        this.dialogRef.close('skipped');
      }
    });
  }
}
