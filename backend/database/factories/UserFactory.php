<?php

namespace Database\Factories;

use App\Models\Role;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $facultyRoleId = Role::firstOrCreate(['name' => 'faculty'])->id;

        return [
            'first_name'  => fake()->firstName(),
            'last_name'   => fake()->lastName(),
            'middle_name' => fake()->optional()->firstName(),
            'code'        => fake()->unique()->numerify('####'),
            'email'       => fake()->unique()->safeEmail(),
            'password'    => static::$password ??= Hash::make('password'),
            'role_id'     => $facultyRoleId,
            'status'      => 'Active',
            'remember_token' => Str::random(10),
        ];
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }

    /**
     * Set user role to admin.
     */
    public function admin(): static
    {
        $adminRoleId = Role::firstOrCreate(['name' => 'admin'])->id;

        return $this->state(fn (array $attributes) => [
            'role_id' => $adminRoleId,
        ]);
    }

    /**
     * Set user role to superadmin.
     */
    public function superAdmin(): static
    {
        $superAdminRoleId = Role::firstOrCreate(['name' => 'superadmin'])->id;

        return $this->state(fn (array $attributes) => [
            'role_id' => $superAdminRoleId,
        ]);
    }

    /**
     * Set user status to Inactive.
     */
    public function inactive(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'Inactive',
        ]);
    }

    /**
     * Set user status to Retired.
     */
    public function retired(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'Retired',
        ]);
    }
}
