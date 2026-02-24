import { Component, Inject, input, OnInit, signal } from '@angular/core';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-dialog-pref-section',
  imports: [MatButtonToggleModule],
  templateUrl: './dialog-pref-section.component.html',
  styleUrl: './dialog-pref-section.component.scss'
})
export class DialogPrefSectionComponent implements OnInit {
  constructor (
    @Inject(MAT_DIALOG_DATA) public data: {sectionMax: number}
  ) {}

  ngOnInit(): void {
    this.generateList();
    throw new Error('Method not implemented.');
  }

  sectionList: number[] | undefined;

  // Generate an array of numbers
  private generateList() {
    this.sectionList = Array.from({
      length: this.data.sectionMax 
    }, (_, i) => i + 1);
  }
}
