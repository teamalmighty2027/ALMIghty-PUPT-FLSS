<?php

namespace Tests\Feature;

use App\Models\PreferencesSetting;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class CheckPreferencesDeadlineTest extends TestCase
{
    use DatabaseTransactions;

    /**
     * Set up fakes for mail and queues before each test.
     */
    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        Queue::fake();
    }

    /**
     * Verifies that expired deadlines are disabled and dates are cleared.
     */
    public function test_expired_deadlines_are_disabled_and_cleared(): void
    {
        $setting = PreferencesSetting::create([
            'faculty_id'          => null,
            'is_enabled'          => true,
            'global_start_date'   => Carbon::yesterday()->subDays(5),
            'global_deadline'     => Carbon::yesterday(),
            'has_request'         => 0,
        ]);

        $this->artisan('preferences:check-deadline')->assertExitCode(0);

        $setting->refresh();

        $this->assertFalse(
            (bool) $setting->is_enabled,
            'Expired preferences must be disabled.'
        );
        $this->assertNull(
            $setting->global_deadline,
            'Expired deadline must be cleared to null.'
        );
        $this->assertNull(
            $setting->global_start_date,
            'Associated start date must be cleared to null on expiry.'
        );
    }

    /**
     * Verifies that subsequent command runs do not resurrect expired status.
     */
    public function test_subsequent_runs_do_not_re_enable_expired_preferences(): void
    {
        $setting = PreferencesSetting::create([
            'faculty_id'          => null,
            'is_enabled'          => true,
            'global_start_date'   => Carbon::yesterday()->subDays(5),
            'global_deadline'     => Carbon::yesterday(),
            'has_request'         => 0,
        ]);

        // First run disables expired deadline
        $this->artisan('preferences:check-deadline')->assertExitCode(0);

        $setting->refresh();
        $this->assertFalse((bool) $setting->is_enabled);

        // Second run must not re-enable
        $this->artisan('preferences:check-deadline')->assertExitCode(0);

        $setting->refresh();
        $this->assertFalse(
            (bool) $setting->is_enabled,
            'Expired preferences must remain disabled on subsequent runs.'
        );
    }

    /**
     * Verifies that future scheduled start dates remain disabled.
     */
    public function test_future_scheduled_start_date_remains_disabled(): void
    {
        $setting = PreferencesSetting::create([
            'faculty_id'          => null,
            'is_enabled'          => false,
            'global_start_date'   => Carbon::tomorrow()->addDay(),
            'global_deadline'     => Carbon::tomorrow()->addDays(5),
            'has_request'         => 0,
        ]);

        $this->artisan('preferences:check-deadline')->assertExitCode(0);

        $setting->refresh();

        $this->assertFalse(
            (bool) $setting->is_enabled,
            'Future scheduled start date must remain disabled.'
        );
    }

    /**
     * Verifies that arrived start date with active deadline is enabled.
     */
    public function test_arrived_start_date_with_active_deadline_is_enabled(): void
    {
        $setting = PreferencesSetting::create([
            'faculty_id'          => null,
            'is_enabled'          => false,
            'global_start_date'   => Carbon::now('Asia/Manila')->startOfDay(),
            'global_deadline'     => Carbon::tomorrow()->addDays(5),
            'has_request'         => 0,
        ]);

        $this->artisan('preferences:check-deadline')->assertExitCode(0);

        $setting->refresh();

        $this->assertTrue(
            (bool) $setting->is_enabled,
            'Preferences with arrived start date and active deadline must enable.'
        );
    }
}
