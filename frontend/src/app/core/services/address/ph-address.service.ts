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
  // Replaces '/api' with '/storage' so it points directly to the files we just generated
  private fallbackUrl = `${environment.apiUrl}/addresses/fallback`;
  
  private pureHttp: HttpClient;

  constructor(private http: HttpClient, private handler: HttpBackend) {
    this.pureHttp = new HttpClient(handler); 
  }

  // 1. Get Provinces
  getProvinces(): Observable<any[]> {
    return this.pureHttp.get<any[]>(`${this.apiUrl}/provinces`).pipe(
      catchError(() => this.getFallbackJson('provinces.json'))
    );
  }

  // 2. Get Cities based on Province/Region Code
  getCities(code: string): Observable<any[]> {
    if (code === '130000000') {
      return this.pureHttp.get<any[]>(`${this.apiUrl}/regions/${code}/cities-municipalities`).pipe(
        catchError(() => this.getFallbackJson(`cities_${code}.json`))
      );
    }

    return this.pureHttp.get<any[]>(`${this.apiUrl}/provinces/${code}/cities-municipalities`).pipe(
      catchError(() => this.getFallbackJson(`cities_${code}.json`))
    );
  }

  // 3. Get Barangays based on City Code
  getBarangays(cityCode: string): Observable<any[]> {
    return this.pureHttp.get<any[]>(`${this.apiUrl}/cities-municipalities/${cityCode}/barangays`).pipe(
      catchError(() => this.getFallbackJson(`barangays_${cityCode}.json`))
    );
  }

  // Fallback JSON Fetcher (Replaced the CSV parser)
  private getFallbackJson(filename: string): Observable<any[]> {
    return this.pureHttp.get<any[]>(`${this.fallbackUrl}/${filename}`).pipe(
      catchError(() => {
        console.error(`Failed to load fallback data: ${filename}`);
        return of([]);
      }) 
    );
  }
}