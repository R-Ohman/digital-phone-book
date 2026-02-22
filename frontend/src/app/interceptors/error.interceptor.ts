import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const messageService = inject(MessageService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const detail =
          (error.error as { detail?: string } | null)?.detail ??
          error.message ??
          'An unexpected error occurred';

        messageService.add({
          severity: 'error',
          summary: `Error ${error.status}`,
          detail,
        });
      }

      return throwError(() => error);
    }),
  );
};
