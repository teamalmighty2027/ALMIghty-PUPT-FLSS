import { Injectable } from '@angular/core';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class PhAddressService {
  // Go back to the real API! No proxy needed once we bypass the interceptor.
  private apiUrl = 'https://psgc.gitlab.io/api';
  
  // Create a separate HttpClient that ignores your auth interceptors
  private pureHttp: HttpClient;

  constructor(private http: HttpClient, private handler: HttpBackend) {
    // This creates a "clean" HTTP client for external APIs
    this.pureHttp = new HttpClient(handler); 
  }

  // 1. Get Provinces
  getProvinces(): Observable<any[]> {
    // Use this.pureHttp instead of this.http!
    return this.pureHttp.get<any[]>(`${this.apiUrl}/provinces`).pipe(
      catchError((error) => {
        console.error('API Error (Provinces):', error);
        return this.getFallbackCsv('provinces.csv');
      })
    );
  }

  // 2. Get Cities based on Province/Region Code
  getCities(code: string): Observable<any[]> {
    // If the code is 130000000 (Metro Manila), fetch from the /regions endpoint
    if (code === '130000000') {
      return this.pureHttp.get<any[]>(`${this.apiUrl}/regions/${code}/cities-municipalities`).pipe(
        catchError(() => this.getFallbackCsv(`cities_${code}.csv`))
      );
    }

    // Otherwise, fetch from the /provinces endpoint normally
    return this.pureHttp.get<any[]>(`${this.apiUrl}/provinces/${code}/cities-municipalities`).pipe(
      catchError(() => this.getFallbackCsv(`cities_${code}.csv`))
    );
  }

  // 3. Get Barangays based on City Code
  getBarangays(cityCode: string): Observable<any[]> {
    return this.pureHttp.get<any[]>(`${this.apiUrl}/cities-municipalities/${cityCode}/barangays`).pipe(
      catchError(() => this.getFallbackCsv(`barangays_${cityCode}.csv`))
    );
  }

  // Fallback CSV Parser
  private getFallbackCsv(filename: string): Observable<any[]> {
    // You can also use pureHttp here just to be safe
    return this.pureHttp.get(`assets/addresses/${filename}`, { responseType: 'text' }).pipe(
      map(csvData => this.parseCsvToJson(csvData)),
      catchError(() => of([])) 
    );
  }

  // Simple CSV to JSON converter
  private parseCsvToJson(csvText: string): any[] {
    const lines = csvText.split('\n');
    const result = [];
    const headers = lines[0].split(',');

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const obj: any = {};
      const currentline = lines[i].split(',');
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j].trim()] = currentline[j]?.trim();
      }
      result.push(obj);
    }
    return result;
  }
}