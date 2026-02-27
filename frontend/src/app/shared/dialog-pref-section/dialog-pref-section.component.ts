import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Section } from '../../core/models/preferences.model';

@Component({
  selector: 'app-dialog-pref-section',
  standalone: true,
  imports: [CommonModule, MatButtonToggleModule, MatButtonModule, FormsModule],
  templateUrl: './dialog-pref-section.component.html',
  styleUrls: ['./dialog-pref-section.component.scss']
})
export class DialogPrefSectionComponent implements OnInit {
  sectionList: number[] = [];
  selectedSection: Section | null = null;

  constructor(
    private dialogRef: MatDialogRef<DialogPrefSectionComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { sectionMax: number, sections: Section[] }
  ) {}

  ngOnInit(): void {
    this.dialogRef.backdropClick().subscribe(() => this.dialogRef.close(null));
  }

  confirm() {
    if (this.selectedSection !== null) {
      this.dialogRef.close(this.selectedSection);
    }
  }

  cancel() {
    this.dialogRef.close(null);
  }
}
