import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-dialog-pref-section',
  standalone: true,
  imports: [CommonModule, MatButtonToggleModule, MatButtonModule, FormsModule],
  templateUrl: './dialog-pref-section.component.html',
  styleUrls: ['./dialog-pref-section.component.scss']
})
export class DialogPrefSectionComponent implements OnInit {
  sectionList: number[] = [];
  selectedSection: number | null = null;

  constructor(
    private dialogRef: MatDialogRef<DialogPrefSectionComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { sectionMax: number }
  ) {}

  ngOnInit(): void {
    this.generateList();
    this.dialogRef.backdropClick().subscribe(() => this.dialogRef.close(0));
  }

  private generateList() {
    this.sectionList = Array.from(
      { length: this.data.sectionMax }, (_, i) => i + 1
    );
  }

  confirm() {
    if (this.selectedSection !== null) {
      this.dialogRef.close(this.selectedSection);
    }
  }

  cancel() {
    this.dialogRef.close(1);
  }
}
