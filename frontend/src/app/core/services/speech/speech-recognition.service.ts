import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionResult {
  transcript: string;
  isFinal: boolean;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

@Injectable({
  providedIn: 'root'
})
export class SpeechRecognitionService {
  private recognition: any;
  private isListening$ = new BehaviorSubject<boolean>(false);
  private transcript$ = new Subject<SpeechRecognitionResult>();
  private error$ = new Subject<string>();
  private isBrowserSupported: boolean;

  constructor() {
    this.isBrowserSupported = this.initializeSpeechRecognition();
  }

  /**
   * Initialize speech recognition based on browser support
   */
  private initializeSpeechRecognition(): boolean {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      console.warn(
        'Speech Recognition API is not supported in this browser. Please use Chrome, Edge, or Safari.'
      );
      return false;
    }

    this.recognition = new SpeechRecognitionAPI();
    this.setupRecognitionListeners();
    this.configureRecognition();
    return true;
  }

  /**
   * Configure recognition settings
   */
  private configureRecognition(): void {
    if (!this.recognition) return;

    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.language = 'en-US';
  }

  /**
   * Setup event listeners for speech recognition
   */
  private setupRecognitionListeners(): void {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      this.isListening$.next(true);
    };

    this.recognition.onend = () => {
      this.isListening$.next(false);
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const isFinal = event.results[i].isFinal;

        if (isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      // Emit final transcript
      if (finalTranscript) {
        this.transcript$.next({
          transcript: finalTranscript.trim(),
          isFinal: true
        });
      }

      // Emit interim transcript
      if (interimTranscript) {
        this.transcript$.next({
          transcript: interimTranscript,
          isFinal: false
        });
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errorMessage = this.getErrorMessage(event.error);
      this.error$.next(errorMessage);
      console.error('Speech recognition error:', event.error);
    };
  }

  /**
   * Start listening for speech
   */
  public startListening(): void {
    if (!this.isBrowserSupported) {
      this.error$.next(
        'Speech Recognition is not supported in your browser.'
      );
      return;
    }

    try {
      this.recognition.start();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      this.error$.next('Failed to start speech recognition.');
    }
  }

  /**
   * Stop listening for speech
   */
  public stopListening(): void {
    if (!this.recognition) return;

    try {
      this.recognition.stop();
    } catch (error) {
      console.error('Error stopping speech recognition:', error);
    }
  }

  /**
   * Abort current recognition session
   */
  public abort(): void {
    if (!this.recognition) return;

    try {
      this.recognition.abort();
    } catch (error) {
      console.error('Error aborting speech recognition:', error);
    }
  }

  /**
   * Set language for recognition
   */
  public setLanguage(language: string): void {
    if (!this.recognition) return;
    this.recognition.language = language;
  }

  /**
   * Get observable for listening status
   */
  public getIsListening(): Observable<boolean> {
    return this.isListening$.asObservable();
  }

  /**
   * Get observable for transcript
   */
  public getTranscript(): Observable<SpeechRecognitionResult> {
    return this.transcript$.asObservable();
  }

  /**
   * Get observable for errors
   */
  public getError(): Observable<string> {
    return this.error$.asObservable();
  }

  /**
   * Check if browser supports speech recognition
   */
  public isSupported(): boolean {
    return this.isBrowserSupported;
  }

  /**
   * Convert error codes to readable messages
   */
  private getErrorMessage(errorCode: string): string {
    const errorMessages: { [key: string]: string } = {
      'no-speech':
        'No speech was detected. Please try again.',
      'audio-capture':
        'No microphone was found. Ensure it is connected and working.',
      'network': 'Network error occurred. Please check your connection.',
      'not-allowed':
        'Permission to use microphone was denied. Please allow microphone access.',
      'service-not-allowed':
        'Speech Recognition service is not allowed.',
      'bad-grammar': 'Error in speech recognition grammar.',
      'aborted': 'Speech recognition was aborted.'
    };

    return errorMessages[errorCode] || `An error occurred: ${errorCode}`;
  }
}
