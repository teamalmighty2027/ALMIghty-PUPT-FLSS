<?php

namespace Tests\Unit\Services;

use App\Services\AuditLogger;
use App\Services\ExternalAccessLogger;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class ExternalAccessLoggerTest extends TestCase
{
    /**
     * Track dispatched audit log calls in tests.
     *
     * @var array
     */
    private array $recordedAudits = [];

    /**
     * Set up the test environment.
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Use in-memory array cache for tests
        config(['cache.default' => 'array']);
        Cache::flush();

        // Intercept audit logs without touching database
        $this->recordedAudits = [];
        AuditLogger::$handler = function (
            string $action,
            string $description,
            ?array $metadata = null
        ) {
            $this->recordedAudits[] = [
                'action' => $action,
                'description' => $description,
                'metadata' => $metadata,
            ];
        };

        Log::spy();
        Carbon::setTestNow('2026-10-22 10:00:00');
    }

    /**
     * Clean up after tests.
     */
    protected function tearDown(): void
    {
        AuditLogger::$handler = null;
        Carbon::setTestNow();
        parent::tearDown();
    }

    /**
     * Test first access logs to both laravel.log and audit_logs.
     */
    public function testFirstAccessLogsToBothLaravelAndAudit(): void
    {
        $request = Request::create('/api/v1/faculties', 'GET');
        $request->attributes->set('client_system', 'orr');

        $result = ExternalAccessLogger::log($request, 'Faculty list');

        $this->assertEquals('orr', $result);
        $this->assertCount(1, $this->recordedAudits);
        $this->assertEquals(
            'Faculty list accessed by external system: orr',
            $this->recordedAudits[0]['description']
        );

        Log::shouldHaveReceived('info')->with(
            'Faculty list accessed by external system: orr',
            ['ip' => '127.0.0.1']
        )->once();
    }

    /**
     * Test rapid calls within 10 minutes are throttled from both logs.
     */
    public function testRapidCallsWithinTenMinutesAreThrottled(): void
    {
        $request = Request::create('/api/v1/faculties', 'GET');
        $request->attributes->set('client_system', 'orr');

        // First call
        ExternalAccessLogger::log($request, 'Faculty list');
        $this->assertCount(1, $this->recordedAudits);

        // Advance 2 minutes
        Carbon::setTestNow('2026-10-22 10:02:00');

        // Second call
        ExternalAccessLogger::log($request, 'Faculty list');

        // Audit log should not be called again
        $this->assertCount(1, $this->recordedAudits);

        // Only one Log::info should have been recorded
        Log::shouldHaveReceived('info')->once();
    }

    /**
     * Test call after 10 minutes logs to laravel.log with suppressed count.
     */
    public function testCallAfterTenMinutesLogsToLaravelWithCount(): void
    {
        $request = Request::create('/api/v1/faculties', 'GET');
        $request->attributes->set('client_system', 'orr');

        // Initial call at 10:00
        ExternalAccessLogger::log($request, 'Faculty list');

        // 3 rapid calls at 10:03
        Carbon::setTestNow('2026-10-22 10:03:00');
        ExternalAccessLogger::log($request, 'Faculty list');
        ExternalAccessLogger::log($request, 'Faculty list');
        ExternalAccessLogger::log($request, 'Faculty list');

        // Advance 12 minutes to 10:12 (cooldown expired for laravel.log)
        Carbon::setTestNow('2026-10-22 10:12:00');
        ExternalAccessLogger::log($request, 'Faculty list');

        // Audit log should still only be 1 (within 1 hour)
        $this->assertCount(1, $this->recordedAudits);

        // Log::info should be called with suppressed_requests = 3
        Log::shouldHaveReceived('info')->with(
            'Faculty list accessed by external system: orr',
            [
                'ip' => '127.0.0.1',
                'suppressed_requests' => 3,
            ]
        )->once();
    }

    /**
     * Test call after 1 hour logs to audit_logs again.
     */
    public function testCallAfterOneHourLogsToAuditAgain(): void
    {
        $request = Request::create('/api/v1/faculties', 'GET');
        $request->attributes->set('client_system', 'orr');

        // First call at 10:00
        ExternalAccessLogger::log($request, 'Faculty list');
        $this->assertCount(1, $this->recordedAudits);

        // Advance past 1 hour (11:05)
        Carbon::setTestNow('2026-10-22 11:05:00');
        ExternalAccessLogger::log($request, 'Faculty list');

        // Audit log should now have 2 records
        $this->assertCount(2, $this->recordedAudits);
    }

    /**
     * Test different systems have independent cooldowns.
     */
    public function testDifferentSystemsHaveIndependentCooldowns(): void
    {
        $requestOrr = Request::create('/api/v1/faculties', 'GET');
        $requestOrr->attributes->set('client_system', 'orr');

        $requestFrrs = Request::create('/api/v1/faculties', 'GET');
        $requestFrrs->attributes->set('client_system', 'frrs');

        ExternalAccessLogger::log($requestOrr, 'Faculty list');
        ExternalAccessLogger::log($requestFrrs, 'Faculty list');

        // Both systems should have been audited independently
        $this->assertCount(2, $this->recordedAudits);
        $this->assertEquals(
            'Faculty list accessed by external system: orr',
            $this->recordedAudits[0]['description']
        );
        $this->assertEquals(
            'Faculty list accessed by external system: frrs',
            $this->recordedAudits[1]['description']
        );
    }

    /**
     * Test different resources have independent cooldowns.
     */
    public function testDifferentResourcesHaveIndependentCooldowns(): void
    {
        $request = Request::create('/api/v1/faculties', 'GET');
        $request->attributes->set('client_system', 'orr');

        ExternalAccessLogger::log($request, 'Faculty list');
        ExternalAccessLogger::log($request, 'Course files');

        // Both resources should have been audited independently
        $this->assertCount(2, $this->recordedAudits);
        $this->assertEquals(
            'Faculty list accessed by external system: orr',
            $this->recordedAudits[0]['description']
        );
        $this->assertEquals(
            'Course files accessed by external system: orr',
            $this->recordedAudits[1]['description']
        );
    }
}
