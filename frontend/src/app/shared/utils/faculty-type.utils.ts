/**
 * Generates an ngClass-compatible object containing CSS classes
 * derived dynamically from a faculty type name.
 * Converts type names to lowercase slugs, and handles sub-types
 * by also adding the parent type class (e.g. "Designee - HAP"
 * generates both "designee-hap" and "designee").
 */
export function getFacultyTypeClass(
  facultyType: string
): Record<string, boolean> {
  if (!facultyType) {
    return {};
  }

  const type = facultyType.toLowerCase();

  // Convert to clean CSS slug: "Full-Time" -> "full-time"
  const slug = type
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const classes: Record<string, boolean> = {
    [slug]: true,
  };

  // If this is a sub-type (contains " - "), add the parent type as a class
  // e.g. "designee - director" -> adds "designee" class
  if (type.includes(' - ')) {
    const parent = type
      .split(' - ')[0]
      .trim()
      .replace(/[^a-z0-9]+/g, '-');

    classes[parent] = true;
  }

  return classes;
}
