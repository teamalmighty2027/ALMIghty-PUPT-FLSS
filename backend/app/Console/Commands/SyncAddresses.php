<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

class SyncAddresses extends Command
{
    // The command you will run in the terminal
    protected $signature = 'address:sync';
    protected $description = 'Downloads the complete PSGC dataset and caches it locally as JSON';

    public function handle()
    {
        $this->info('Downloading complete dataset from Github (isaacdarcilla/philippine-addresses)...');

        // Fetch the raw data from the community-standard repository
        $provData = Http::get('https://raw.githubusercontent.com/isaacdarcilla/philippine-addresses/refs/heads/main/province.json')->json();
        $cityData = Http::get('https://raw.githubusercontent.com/isaacdarcilla/philippine-addresses/refs/heads/main/city.json')->json();
        $brgyData = Http::get('https://raw.githubusercontent.com/isaacdarcilla/philippine-addresses/refs/heads/main/barangay.json')->json();

        $this->info('Formatting and splitting data...');

        // 1. Process Provinces (and inject Metro Manila)
        $provinces = [];
        foreach ($provData as $p) {
            $provinces[] = ['code' => $p['province_code'], 'name' => $p['province_name']];
        }
        $provinces[] = ['code' => '130000000', 'name' => 'Metro Manila']; // Add NCR manually
        
        Storage::disk('public')->put('addresses/provinces.json', json_encode($provinces));

        // 2. Process Cities
        $citiesByProv = [];
        foreach ($cityData as $c) {
            // Group NCR cities under our fake Metro Manila code
            $provCode = $c['region_desc'] === 'NCR' ? '130000000' : $c['province_code'];
            $citiesByProv[$provCode][] = ['code' => $c['city_code'], 'name' => $c['city_name']];
        }

        foreach ($citiesByProv as $provCode => $cities) {
            Storage::disk('public')->put("addresses/cities_{$provCode}.json", json_encode($cities));
        }

        // 3. Process Barangays
        $brgyByCity = [];
        foreach ($brgyData as $b) {
            $brgyByCity[$b['city_code']][] = ['code' => $b['brgy_code'], 'name' => $b['brgy_name']];
        }

        foreach ($brgyByCity as $cityCode => $brgys) {
            Storage::disk('public')->put("addresses/barangays_{$cityCode}.json", json_encode($brgys));
        }

        $this->info('Complete! All Philippine addresses are now cached in public/storage/addresses.');
    }
}