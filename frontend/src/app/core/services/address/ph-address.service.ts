import { Injectable } from '@angular/core';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class PhAddressService {
  private readonly apiUrl = 'https://psgc.gitlab.io/api';

  private pureHttp: HttpClient;

  /**
   * Create a clean HttpClient that bypasses interceptors.
   */
  constructor(private http: HttpClient, private handler: HttpBackend) {
    this.pureHttp = new HttpClient(handler);
  }

  /**
   * Fetch list of provinces from PSGC API.
   */
  getProvinces(): Observable<any[]> {
    return this.pureHttp
      .get<any[]>(`${this.apiUrl}/provinces`)
      .pipe(
        catchError((error) => {
          console.error('API Error (Provinces):', error);
          return this.getFallbackCsv('provinces.csv');
        })
      );
  }

  /**
   * Fetch cities/municipalities for a given province or region code.
   */
  getCities(code: string): Observable<any[]> {
    // If the code is 130000000 (Metro Manila), fetch from the /regions endpoint
    if (code === '130000000') {
      return this.pureHttp
        .get<any[]>(`${this.apiUrl}/regions/${code}/cities-municipalities`)
        .pipe(catchError(() => this.getFallbackCsv(`cities_${code}.csv`)));
    }

    return this.pureHttp
      .get<any[]>(`${this.apiUrl}/provinces/${code}/cities-municipalities`)
      .pipe(catchError(() => this.getFallbackCsv(`cities_${code}.csv`)));
  }

  /**
   * Fetch barangays for a given city code.
   */
  getBarangays(cityCode: string): Observable<any[]> {
    return this.pureHttp
      .get<any[]>(`${this.apiUrl}/cities-municipalities/${cityCode}/barangays`)
      .pipe(catchError(() => this.getFallbackCsv(`barangays_${cityCode}.csv`)));
  }

  /**
   * Load fallback CSV from assets and parse to JSON.
   */
  private getFallbackCsv(filename: string): Observable<any[]> {
    return this.pureHttp
      .get(`assets/addresses/${filename}`, { responseType: 'text' })
      .pipe(
        map((csvData) => this.parseCsvToJson(csvData)),
        catchError(() => of([]))
      );
  }

  /**
   * Convert simple CSV text to an array of objects.
   */
  private parseCsvToJson(csvText: string): any[] {
    const lines = csvText.split('\n');
    const result: any[] = [];
    const headers = lines[0]?.split(',') ?? [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const obj: any = {};
      const currentline = line.split(',');
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j].trim()] = currentline[j]?.trim();
      }
      result.push(obj);
    }
    return result;
  }
}