/**
 * PUPT-FLSS Maintenance Build Script
 * Generates standalone, zero-backend static maintenance files and zip archive.
 */

const fs = require('fs');
const path = require('path');

// Root directories
const frontendRoot = path.resolve(__dirname, '..');
const maintenanceDir = path.join(frontendRoot, 'maintenance');
const distBrowserDir = path.join(
  frontendRoot,
  'dist',
  'pupt-flss',
  'browser'
);
const distMaintenanceDir = path.join(frontendRoot, 'dist', 'maintenance');
const distDir = path.join(frontendRoot, 'dist');

/**
 * Parses command line arguments for --until or --time flags.
 * @returns {string|null} The completion time string if provided.
 */
function parseCompletionTime() {
  const args = process.argv.slice(2);
  let time = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--until=')) {
      time = arg.substring('--until='.length);
    } else if (arg.startsWith('--time=')) {
      time = arg.substring('--time='.length);
    } else if ((arg === '--until' || arg === '-u') && args[i + 1]) {
      time = args[i + 1];
      i++;
    } else if ((arg === '--time' || arg === '-t') && args[i + 1]) {
      time = args[i + 1];
      i++;
    }
  }

  return time ? time.trim() : null;
}

/**
 * Escapes HTML characters in user provided text.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generates the HTML banner for completion time.
 * @param {string|null} completionTime
 * @returns {string}
 */
function buildCompletionBanner(completionTime) {
  if (completionTime) {
    const escaped = escapeHtml(completionTime);

    return `<div class="completion-banner">\n` +
      `        Expected Service Restoration: ` +
      `<strong>${escaped}</strong>\n` +
      `      </div>`;
  }

  return `<div class="completion-banner">\n` +
    `        Scheduled maintenance in progress. ` +
    `Expected to resume shortly.\n` +
    `      </div>`;
}

/**
 * Ensures directory exists, creating parent directories if needed.
 * @param {string} dirPath
 */
function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Copies file safely with logging.
 * @param {string} src
 * @param {string} dest
 */
function copyFileSync(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  } else {
    console.warn(`[WARN] Source file not found: ${src}`);
  }
}

/**
 * Creates zip archive containing maintenance files using JSZip.
 * @param {Array<{name: string, content: Buffer|string}>} files
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
async function createZipArchive(files, outputPath) {
  try {
    const JSZip = require('jszip');
    const zip = new JSZip();

    files.forEach(file => {
      zip.file(file.name, file.content);
    });

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    fs.writeFileSync(outputPath, buffer);
    console.log(`[OK] Created deployment zip: ${outputPath}`);
  } catch (err) {
    console.warn(`[WARN] Could not create zip archive: ${err.message}`);
  }
}

/**
 * Main execution method for the maintenance build.
 */
async function run() {
  console.log('==============================================');
  console.log('  PUPT-FLSS Maintenance Build Generator');
  console.log('==============================================\n');

  const completionTime = parseCompletionTime();

  if (completionTime) {
    console.log(`Target completion time set: "${completionTime}"`);
  } else {
    console.log('No specific completion time passed. Using default banner.');
  }

  // Read template HTML
  const templatePath = path.join(maintenanceDir, 'index.html');

  if (!fs.existsSync(templatePath)) {
    console.error(`[ERROR] Template not found at: ${templatePath}`);
    process.exit(1);
  }

  let htmlContent = fs.readFileSync(templatePath, 'utf8');
  const bannerHtml = buildCompletionBanner(completionTime);
  htmlContent = htmlContent.replace(
    '{{ESTIMATED_COMPLETION_BANNER}}',
    bannerHtml
  );

  // Read .htaccess, 503.json, and robots.txt
  const htaccessPath = path.join(maintenanceDir, '.htaccess');
  const jsonPath = path.join(maintenanceDir, '503.json');
  const robotsPath = path.join(maintenanceDir, 'robots.txt');
  const logoPath = path.join(
    frontendRoot,
    'src',
    'assets',
    'images',
    'pup_taguig_logo.svg'
  );

  const htaccessContent = fs.existsSync(htaccessPath)
    ? fs.readFileSync(htaccessPath, 'utf8')
    : '';

  const jsonContent = fs.existsSync(jsonPath)
    ? fs.readFileSync(jsonPath, 'utf8')
    : '';

  const robotsContent = fs.existsSync(robotsPath)
    ? fs.readFileSync(robotsPath, 'utf8')
    : '';

  // Locate favicon from available project assets
  const faviconCandidates = [
    path.join(frontendRoot, 'src', 'assets', 'images', 'pupt.ico'),
    path.join(frontendRoot, 'src', 'favicon.ico'),
  ];
  let faviconBuffer = Buffer.from('');

  for (let i = 0; i < faviconCandidates.length; i++) {
    if (fs.existsSync(faviconCandidates[i])) {
      faviconBuffer = fs.readFileSync(faviconCandidates[i]);
      break;
    }
  }

  const logoContent = fs.existsSync(logoPath)
    ? fs.readFileSync(logoPath, 'utf8')
    : '';

  // Ensure target directories exist
  ensureDirSync(distDir);
  ensureDirSync(distMaintenanceDir);
  ensureDirSync(distBrowserDir);

  const targetDirs = [distMaintenanceDir, distBrowserDir];

  targetDirs.forEach(target => {
    fs.writeFileSync(path.join(target, 'index.html'), htmlContent, 'utf8');

    if (htaccessContent) {
      fs.writeFileSync(path.join(target, '.htaccess'), htaccessContent, 'utf8');
    }

    if (jsonContent) {
      fs.writeFileSync(path.join(target, '503.json'), jsonContent, 'utf8');
    }

    if (robotsContent) {
      fs.writeFileSync(path.join(target, 'robots.txt'), robotsContent, 'utf8');
    }

    if (faviconBuffer.length > 0) {
      fs.writeFileSync(path.join(target, 'favicon.ico'), faviconBuffer);
    }

    if (logoContent) {
      fs.writeFileSync(
        path.join(target, 'pup_taguig_logo.svg'),
        logoContent,
        'utf8'
      );
    }

    console.log(`[OK] Deployed maintenance files to: ${target}`);
  });

  // Create deployable zip archive
  const zipFiles = [
    { name: 'index.html', content: htmlContent },
    { name: '.htaccess', content: htaccessContent },
    { name: '503.json', content: jsonContent },
    { name: 'robots.txt', content: robotsContent },
    { name: 'favicon.ico', content: faviconBuffer },
    { name: 'pup_taguig_logo.svg', content: logoContent },
  ];

  const zipOutputPath = path.join(distDir, 'pupt-flss-maintenance.zip');
  await createZipArchive(zipFiles, zipOutputPath);

  console.log('\n----------------------------------------------');
  console.log('Build completed successfully!');
  console.log('Deployable options:');
  console.log('  1. Direct folder: dist/pupt-flss/browser');
  console.log('  2. Standalone folder: dist/maintenance');
  console.log('  3. Zip package: dist/pupt-flss-maintenance.zip');
  console.log('----------------------------------------------\n');
}

run();
