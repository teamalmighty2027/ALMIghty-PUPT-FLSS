import { Injectable } from '@angular/core';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../environments/environment.dev';

@Injectable({
  providedIn: 'root'
})
export class PhAddressService {
  // Primary API (External)
  private apiUrl = 'https://psgc.gitlab.io/api';
  
  // Fallback API (Points to your Laravel server's public storage)
  private fallbackUrl = `${environment.apiUrl}/addresses/fallback`;
  
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
    return this.pureHttp.get<any[]>(`${this.apiUrl}/provinces`).pipe(
      catchError(() => this.getFallbackJson('provinces.json'))
    );
  }

  /**
   * Fetch cities/municipalities for a given province or region code.
   */
  getCities(code: string): Observable<any[]> {
    // If the code is 130000000 (Metro Manila), fetch from the /regions endpoint
    if (code === '130000000') {
      return this.pureHttp.get<any[]>(`${this.apiUrl}/regions/${code}/cities-municipalities`).pipe(
        catchError(() => this.getFallbackJson(`cities_${code}.json`))
      );
    }

    // Otherwise, fetch from the /provinces endpoint normally
    return this.pureHttp.get<any[]>(`${this.apiUrl}/provinces/${code}/cities-municipalities`).pipe(
      catchError(() => this.getFallbackJson(`cities_${code}.json`))
    );
  }

  /**
   * Fetch barangays for a given city code.
   */
  getBarangays(cityCode: string): Observable<any[]> {
    return this.pureHttp.get<any[]>(`${this.apiUrl}/cities-municipalities/${cityCode}/barangays`).pipe(
      catchError(() => this.getFallbackJson(`barangays_${cityCode}.json`))
    );
  }

  /**
   * Fallback JSON Fetcher
   */
  private getFallbackJson(filename: string): Observable<any[]> {
    return this.pureHttp.get<any[]>(`${this.fallbackUrl}/${filename}`).pipe(
      catchError((error) => {
        console.error(`Failed to load fallback data: ${filename}`, error);
        return of([]);
      }) 
    );
  }
}