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

            // Custom 401 Error view response
            return response()->view('errors.401', [], 401);
        }

        if ($request->expectsJson()) {
            $status = 500;
            $data = ['message' => $exception->getMessage()];

            if (method_exists($exception, 'getStatusCode')) {
                $status = $exception->getStatusCode();
            } elseif (property_exists($exception, 'status')) {
                $status = $exception->status;
            }

            if ($exception instanceof \Illuminate\Validation\ValidationException) {
                $data['errors'] = $exception->errors();
            }

            return response()->json($data, $status);
        }

        return parent::render($request, $exception);
    }
}
