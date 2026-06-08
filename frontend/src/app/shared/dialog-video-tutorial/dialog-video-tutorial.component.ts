import { Component, Inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSymbolDirective } from '../../core/imports/mat-symbol.directive';

export interface VideoTutorialStep {
  stepNumber: number;
  title: string;
  description: string;
  icon: string;
  highlight?: string;
}

export interface VideoTutorialData {
  /** Display title shown in the dialog header */
  title: string;
  /** Short description shown below the title */
  description: string;
  /** Raw YouTube URL — converted to embed automatically */
  youtubeUrl: string;
  /** Optional step-by-step guide steps. If provided, shows a Guide tab. */
  steps?: VideoTutorialStep[];
}

export type VideoTab = 'guide' | 'video';

@Component({
  selector: 'app-dialog-video-tutorial',
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatSymbolDirective],
  templateUrl: './dialog-video-tutorial.component.html',
  styleUrls: ['./dialog-video-tutorial.component.scss'],
})
export class DialogVideoTutorialComponent implements OnDestroy {
  readonly safeEmbedUrl: SafeResourceUrl;
  readonly title: string;
  readonly description: string;
  readonly steps: VideoTutorialStep[];
  readonly hasTabs: boolean;

  activeTab: VideoTab = 'guide';
  currentStepIndex = 0;

  get currentStep(): VideoTutorialStep {
    return this.steps[this.currentStepIndex];
  }

  get isFirstStep(): boolean { return this.currentStepIndex === 0; }
  get isLastStep(): boolean  { return this.currentStepIndex === this.steps.length - 1; }

  get progressPercent(): number {
    return ((this.currentStepIndex + 1) / this.steps.length) * 100;
  }

  constructor(
    public dialogRef: MatDialogRef<DialogVideoTutorialComponent>,
    @Inject(MAT_DIALOG_DATA) public data: VideoTutorialData,
    private sanitizer: DomSanitizer,
  ) {
    this.title       = data.title;
    this.description = data.description;
    this.steps       = data.steps ?? [];
    this.hasTabs     = this.steps.length > 0;

    // Default to video tab when no steps are provided
    this.activeTab = this.hasTabs ? 'guide' : 'video';

    this.safeEmbedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      this.toEmbedUrl(data.youtubeUrl),
    );
  }

  setTab(tab: VideoTab): void { this.activeTab = tab; }

  next(): void     { if (!this.isLastStep)  this.currentStepIndex++; }
  previous(): void { if (!this.isFirstStep) this.currentStepIndex--; }

  goToStep(i: number): void {
    if (i >= 0 && i < this.steps.length) this.currentStepIndex = i;
  }

  close(): void { this.dialogRef.close(); }

  ngOnDestroy(): void {}

  private toEmbedUrl(url: string): string {
    let videoId = '';
    const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
    if (shortMatch) videoId = shortMatch[1];
    if (!videoId) {
      const watchMatch = url.match(/[?&]v=([^&]+)/);
      if (watchMatch) videoId = watchMatch[1];
    }
    if (!videoId) {
      const embedMatch = url.match(/embed\/([^?&]+)/);
      if (embedMatch) videoId = embedMatch[1];
    }
    if (!videoId) return url;
    return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
  }
}
