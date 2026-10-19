<?php
namespace App\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Throwable;

class Handler extends ExceptionHandler
{
    protected $dontReport = [
        //
    ];

    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    public function register()
    {
        $this->reportable(function (Throwable $e) {
            //
        });
    }

    public function render($request, Throwable $exception)
    {
        // 401 Error JSON response
        if ($exception instanceof AuthenticationException) {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }
            return response()->view('errors.401', [], 401);
        }

        if ($request->expectsJson()) {
            $status = 500;
            
            // Determine the status code
            if (method_exists($exception, 'getStatusCode')) {
                $status = $exception->getStatusCode();
            } elseif (property_exists($exception, 'status')) {
                $status = $exception->status;
            }

            // Catch TypeErrors or Database errors (often caused by bypassed validation)
            // and force them to be 400 Bad Request instead of 500 Server Error
            if ($exception instanceof \TypeError || $exception instanceof \Illuminate\Database\QueryException) {
                $status = 400;
                $message = 'Invalid input data format provided.';
            } else {
                // For actual 500 errors, mask the message unless in debug mode
                $message = ($status == 500 && !config('app.debug')) 
                    ? 'A server error occurred. Please try again later.' 
                    : $exception->getMessage();
            }

            $data = ['message' => $message];

            // 422 Unprocessable Entity for Validation Failures
            if ($exception instanceof \Illuminate\Validation\ValidationException) {
                $status = 422;
                $data['message'] = 'The given data was invalid.';
                $data['errors'] = $exception->errors();
            }

            return response()->json($data, $status);
        }

        return parent::render($request, $exception);
    }
}
