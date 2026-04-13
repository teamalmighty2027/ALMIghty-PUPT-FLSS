import { Component, Inject, OnInit, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SafeResourceUrl, DomSanitizer } from '@angular/platform-browser';

import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { LoadingComponent } from '../loading/loading.component';
import { fadeAnimation } from '../../core/animations/animations';

interface ExportDialogData {
  exportType: 'all' | 'single';
  entity?: string;
  entityData?: any;
  customTitle?: string;
  subtitle?: string;
  generatePdfFunction?: (showPreview: boolean) => Blob | Promise<Blob> | void;
  // NEW: This tells the dialog it's allowed to receive an Excel function!
  generateExcelFunction?: () => Promise<void> | void; 
  generateFileNameFunction?: () => string; 
}

@Component({
    selector: 'app-dialog-export',
    imports: [
        CommonModule,
        LoadingComponent,
        MatTableModule,
        MatButtonModule,
        MatIconModule,
    ],
    templateUrl: './dialog-export.component.html',
    styleUrls: ['./dialog-export.component.scss'],
    animations: [fadeAnimation]
})
export class DialogExportComponent implements OnInit, AfterViewInit, OnDestroy {
  title: string = '';
  subtitle: string = '';
  isLoading = true;
  exportType: 'all' | 'single' = 'single';
  pdfBlobUrl: SafeResourceUrl | null = null;
  
  // Track the raw URL so we can revoke it and prevent memory leaks
  private currentRawBlobUrl: string | null = null;

  @ViewChild('pdfIframe') pdfIframe!: ElementRef<HTMLIFrameElement>;

  constructor(
    public dialogRef: MatDialogRef<DialogExportComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ExportDialogData,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.exportType = this.data.exportType || 'single';
    this.setTitleAndSubtitle();
  }

  ngAfterViewInit(): void {
    if (this.data.generatePdfFunction) {
      setTimeout(() => this.renderPdfPreview(), 0);
    } else {
      this.isLoading = false;
    }
  }

  ngOnDestroy(): void {
    // Revoke the blob URL when the dialog closes to free up memory
    if (this.currentRawBlobUrl) {
      URL.revokeObjectURL(this.currentRawBlobUrl);
    }
  }

  private setTitleAndSubtitle(): void {
    const { customTitle, entityData, subtitle } = this.data;
  
    if (entityData) {
      this.title = entityData.name || entityData.title || customTitle || 'Export to PDF';
      this.subtitle = this.getSubtitle(entityData);
    } else {
      this.title = customTitle || 'Export to PDF';
      this.subtitle = subtitle || ''; 
    }
  }

  private getSubtitle(entityData: any): string {
    if (entityData.academic_year && entityData.semester_label) {
      return `For Academic Year ${entityData.academic_year}, ${entityData.semester_label}`;
    } else if (entityData.description) {
      return entityData.description;
    }
    return '';
  }

  /**
   * This function handles both generating the PDF blob and updating the iframe preview.
   */
  private async renderPdfPreview(): Promise<void> {
    try {
      const result = this.data.generatePdfFunction?.(true);
      const pdfBlob = result instanceof Promise ? await result : result;

      if (pdfBlob) {
        // Clean up the previous URL if it exists
        if (this.currentRawBlobUrl) {
          URL.revokeObjectURL(this.currentRawBlobUrl);
        }

        this.currentRawBlobUrl = URL.createObjectURL(pdfBlob);
        this.pdfBlobUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.currentRawBlobUrl); 
    
        if (this.pdfIframe?.nativeElement) {
          this.pdfIframe.nativeElement.src = this.currentRawBlobUrl; 
        }
      }
    } catch (error) {
      console.error('Error generating PDF preview:', error);
    } finally {
      this.isLoading = false;
    }
  }
  
  /**
   * This function is called when the user clicks the "Download PDF" button. 
   * It generates the PDF blob and triggers the download.
   */
  public async downloadPdf(): Promise<void> {
    try {
      const result = this.data.generatePdfFunction?.(false); 
      const pdfBlob = result instanceof Promise ? await result : result;

      if (pdfBlob) {
        let fileName = this.data.generateFileNameFunction 
          ? this.data.generateFileNameFunction() 
          : `${this.title.replace(/ /g, '_').toLowerCase()}.pdf`;
    
        const blobUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(blobUrl); 
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
    }
  }

  // NEW: This function is called when the user clicks the "Download Excel" button!
  public async downloadExcel(): Promise<void> {
    if (this.data.generateExcelFunction) {
      try {
        await this.data.generateExcelFunction();
      } catch (error) {
        console.error('Error downloading Excel:', error);
      }
    }
  }

  public closeDialog(): void {
    this.dialogRef.close();
  }
}