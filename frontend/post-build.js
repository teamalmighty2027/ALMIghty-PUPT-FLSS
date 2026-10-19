// This script ensures no 0-byte JS chunk files exist in the build output.
// Empty chunks are filled with a dummy export and updated in ngsw.json.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const distDir = path.join(__dirname, 'dist', 'pupt-flss', 'browser');
const ngswPath = path.join(distDir, 'ngsw.json');

if (!fs.existsSync(distDir)) {
  console.log('Dist directory does not exist. Skipping post-build check.');
  process.exit(0);
}

const files = fs.readdirSync(distDir);
const jsFiles = files.filter(f => f.endsWith('.js'));

let updatedFilesCount = 0;
const hashUpdates = {};

jsFiles.forEach(file => {
  const filePath = path.join(distDir, file);
  const stats = fs.statSync(filePath);
  
  if (stats.size === 0) {
    console.log(`Found empty chunk: ${file}. Adding stub.`);
    fs.writeFileSync(filePath, 'export {};\n', 'utf8');
    
    // Calculate new SHA-1 hash for the file
    const content = fs.readFileSync(filePath);
    const shasum = crypto.createHash('sha1');
    shasum.update(content);
    const newHash = shasum.digest('hex');
    
    hashUpdates[`/${file}`] = newHash;
    updatedFilesCount++;
  }
});

// Update ngsw.json if files were updated
if (updatedFilesCount > 0 && fs.existsSync(ngswPath)) {
  console.log(`Updating ${updatedFilesCount} file hash(es) in ngsw.json...`);
  const ngswContent = fs.readFileSync(ngswPath, 'utf8');
  let ngswJson = JSON.parse(ngswContent);
  
  if (ngswJson.hashTable) {
    Object.keys(hashUpdates).forEach(key => {
      if (ngswJson.hashTable[key]) {
        ngswJson.hashTable[key] = hashUpdates[key];
      }
    });
    
    fs.writeFileSync(ngswPath, JSON.stringify(ngswJson, null, 2), 'utf8');
    console.log('ngsw.json updated successfully.');
  }
}
